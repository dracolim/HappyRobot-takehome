import { WebSocketServer, WebSocket } from "ws"
import { Server } from "http"
import jwt from "jsonwebtoken"
import { Redis } from "ioredis"
import { db } from "../db"
import { users } from "../db/schema"
import { inArray } from "drizzle-orm"

interface Client {
  ws: WebSocket
  userId: string
  userName: string
  projectId: string
}

const clients = new Set<Client>()
let publisher: Redis
let subscriber: Redis
let presenceRedis: Redis

// backpressure: max messages per user per window
const WS_RATE_WINDOW_MS = 10_000
const WS_RATE_MAX = 30
const wsMessageCounts = new Map<string, { count: number; resetAt: number }>()

const PRESENCE_TTL = 30 // seconds
const PRESENCE_KEY = (taskId: string) => `presence:${taskId}`

async function getPresence(taskId: string): Promise<{ userId: string; name: string }[]> {
  const now = Math.floor(Date.now() / 1000)
  const staleThreshold = now - PRESENCE_TTL

  // prune stale entries, then read active ones
  await presenceRedis.zremrangebyscore(PRESENCE_KEY(taskId), "-inf", staleThreshold)
  const userIds = await presenceRedis.zrangebyscore(PRESENCE_KEY(taskId), staleThreshold + 1, "+inf")

  if (userIds.length === 0) return []

  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
  return rows.map((r) => ({ userId: r.id, name: r.name }))
}

async function upsertPresence(taskId: string, userId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await presenceRedis.zadd(PRESENCE_KEY(taskId), now, userId)
}

async function removePresence(taskId: string, userId: string): Promise<void> {
  await presenceRedis.zrem(PRESENCE_KEY(taskId), userId)
}

export function setupWebSocket(server: Server): void {
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379"
  publisher = new Redis(redisUrl)
  subscriber = new Redis(redisUrl)
  presenceRedis = new Redis(redisUrl)

  subscriber.on("message", (channel: string, raw: string) => {
    const projectId = channel.replace("project:", "")
    const { event, senderId } = JSON.parse(raw) as { event: object; senderId?: string }

    for (const client of clients) {
      if (
        client.projectId === projectId &&
        client.userId !== senderId &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(JSON.stringify(event))
      }
    }
  })

  const wss = new WebSocketServer({ server, path: "/ws" })

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url!, "http://localhost")
    const token = url.searchParams.get("token")
    const projectId = url.searchParams.get("projectId")

    if (!token || !projectId) {
      ws.close(1008, "Missing token or projectId")
      return
    }

    let userId: string
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string }
      userId = payload.sub
    } catch {
      ws.close(1008, "Invalid token")
      return
    }

    const [userRow] = await db.select({ name: users.name }).from(users).where(inArray(users.id, [userId]))
    const userName = userRow?.name ?? "Unknown"

    const client: Client = { ws, userId, userName, projectId }
    clients.add(client)

    const channel = `project:${projectId}`
    const isFirstLocal = [...clients].filter((c) => c.projectId === projectId).length === 1
    if (isFirstLocal) subscriber.subscribe(channel)

    // track which task this client is currently viewing (for cleanup on disconnect)
    let currentTaskId: string | null = null

    ws.on("message", async (data) => {
      try {
        // backpressure: drop messages exceeding rate limit
        const now = Date.now()
        const bucket = wsMessageCounts.get(userId) ?? { count: 0, resetAt: now + WS_RATE_WINDOW_MS }
        if (now > bucket.resetAt) { bucket.count = 0; bucket.resetAt = now + WS_RATE_WINDOW_MS }
        bucket.count++
        wsMessageCounts.set(userId, bucket)
        if (bucket.count > WS_RATE_MAX) {
          console.warn(`[WS backpressure] user=${userId} exceeded ${WS_RATE_MAX} msgs/${WS_RATE_WINDOW_MS}ms`)
          return
        }

        console.log(`[WS in] user=${userId} project=${projectId}`, data.toString())
        const msg = JSON.parse(data.toString()) as { type: string; taskId?: string }

        if (msg.type === "presence.join" && msg.taskId) {
          // leave previous task if any
          if (currentTaskId && currentTaskId !== msg.taskId) {
            await removePresence(currentTaskId, userId)
            const prev = await getPresence(currentTaskId)
            broadcast(projectId, { type: "presence.updated", taskId: currentTaskId, users: prev }, userId).catch(() => {})
          }

          currentTaskId = msg.taskId
          await upsertPresence(msg.taskId, userId)
          const updated = await getPresence(msg.taskId)
          // broadcast to ALL including sender so they see who else is there
          await publisher.publish(channel, JSON.stringify({
            event: { type: "presence.updated", taskId: msg.taskId, users: updated },
          }))
          // also send directly to sender
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "presence.updated", taskId: msg.taskId, users: updated }))
          }
        }

        if (msg.type === "presence.leave" && msg.taskId) {
          currentTaskId = null
          await removePresence(msg.taskId, userId)
          const updated = await getPresence(msg.taskId)
          broadcast(projectId, { type: "presence.updated", taskId: msg.taskId, users: updated }, userId).catch(() => {})
        }

        if (msg.type === "presence.ping" && msg.taskId) {
          await upsertPresence(msg.taskId, userId)
        }
      } catch {
        // ignore malformed messages
      }
    })

    ws.on("close", async () => {
      clients.delete(client)
      const remaining = [...clients].filter((c) => c.projectId === projectId)
      if (remaining.length === 0) subscriber.unsubscribe(channel)

      if (currentTaskId) {
        await removePresence(currentTaskId, userId)
        const updated = await getPresence(currentTaskId)
        broadcast(projectId, { type: "presence.updated", taskId: currentTaskId, users: updated }, userId).catch(() => {})
      }
    })

    ws.on("error", () => clients.delete(client))
  })
}

export async function broadcast(projectId: string, event: object, senderId?: string): Promise<void> {
  await publisher.publish(`project:${projectId}`, JSON.stringify({ event, senderId }))
}
