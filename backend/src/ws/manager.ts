import { WebSocketServer, WebSocket } from "ws"
import { Server } from "http"
import jwt from "jsonwebtoken"
import { Redis } from "ioredis"
import * as Y from "yjs"
import { db } from "../db"
import { users, tasks } from "../db/schema"
import { eq, inArray, sql } from "drizzle-orm"
import { isRevoked } from "../revocation"

interface Client {
  ws: WebSocket
  userId: string
  userName: string
  projectId: string
  currentTaskId?: string
  currentMode: "viewing" | "editing"
  isAlive: boolean
  offlineSent: boolean  // true once presence.offline was received — prevents double-broadcast on close
}

const clients = new Set<Client>()
let publisher: Redis
let subscriber: Redis
let presenceRedis: Redis

const WS_RATE_WINDOW_MS = 10_000
const WS_RATE_MAX = 30
const wsMessageCounts = new Map<string, { count: number; resetAt: number }>()

const PRESENCE_TTL = 30 // seconds
const PRESENCE_KEY = (taskId: string) => `presence:${taskId}`

const PROJECT_ONLINE_TTL = 90 // seconds — user gone after missing 3 × 30s pings
const PROJECT_ONLINE_KEY = (projectId: string) => `project:online:${projectId}`

// tracks last broadcast per project so the poll only pushes when the list actually changed
const lastOnlineSnapshot = new Map<string, string>()

const YJS_EVICT_IDLE_MS = 10 * 60 * 1000 // evict docs idle for 10 min
const yjsDocs = new Map<string, { doc: Y.Doc; projectId: string; lastUsedAt: number }>()
const yjsSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()

async function getOrCreateYjsDoc(taskId: string, projectId: string): Promise<Y.Doc> {
  const entry = yjsDocs.get(taskId)
  if (entry) {
    entry.lastUsedAt = Date.now()
    return entry.doc
  }
  const [row] = await db.select({ configuration: tasks.configuration }).from(tasks).where(eq(tasks.id, taskId))
  const doc = new Y.Doc()
  const description = row?.configuration?.description ?? ""
  if (description) doc.getText("description").insert(0, description)
  yjsDocs.set(taskId, { doc, projectId, lastUsedAt: Date.now() })
  return doc
}

async function flushAndEvictYjsDoc(taskId: string): Promise<void> {
  const entry = yjsDocs.get(taskId)
  if (!entry) return
  const saveTimer = yjsSaveTimers.get(taskId)
  if (saveTimer) {
    clearTimeout(saveTimer)
    yjsSaveTimers.delete(taskId)
    const description = entry.doc.getText("description").toString()
    await db.execute(
      sql`UPDATE tasks SET configuration = jsonb_set(configuration, '{description}', to_jsonb(${description}::text)), updated_at = NOW() WHERE id = ${taskId}`
    ).catch(err => console.error("[YJS evict flush]", err))
  }
  yjsDocs.delete(taskId)
}

function scheduleYjsSave(taskId: string): void {
  const existing = yjsSaveTimers.get(taskId)
  if (existing) clearTimeout(existing)
  const entry = yjsDocs.get(taskId)
  if (entry) entry.lastUsedAt = Date.now()
  yjsSaveTimers.set(taskId, setTimeout(async () => {
    const e = yjsDocs.get(taskId)
    if (!e) return
    const description = e.doc.getText("description").toString()
    try {
      // jsonb_set updates only the description key — avoids a read-modify-write race
      // with concurrent PATCH requests that update tags or other config fields.
      await db.execute(
        sql`UPDATE tasks SET configuration = jsonb_set(configuration, '{description}', to_jsonb(${description}::text)), updated_at = NOW() WHERE id = ${taskId}`
      )
    } catch (err) {
      console.error("[YJS save]", err)
    }
    yjsSaveTimers.delete(taskId)
  }, 3_000))
}

async function getPresence(taskId: string): Promise<{ userId: string; name: string; mode: "viewing" | "editing" }[]> {
  const now = Math.floor(Date.now() / 1000)
  const staleThreshold = now - PRESENCE_TTL

  await presenceRedis.zremrangebyscore(PRESENCE_KEY(taskId), "-inf", staleThreshold)
  const userIds = await presenceRedis.zrangebyscore(PRESENCE_KEY(taskId), staleThreshold + 1, "+inf")

  if (userIds.length === 0) return []

  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
  return rows.map((r) => {
    const client = [...clients].find(c => c.userId === r.id && c.currentTaskId === taskId)
    return { userId: r.id, name: r.name, mode: client?.currentMode ?? "viewing" as const }
  })
}

async function upsertPresence(taskId: string, userId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await presenceRedis.zadd(PRESENCE_KEY(taskId), now, userId)
}

async function removePresence(taskId: string, userId: string): Promise<void> {
  await presenceRedis.zrem(PRESENCE_KEY(taskId), userId)
}

async function getProjectOnline(projectId: string): Promise<string[]> {
  const key = PROJECT_ONLINE_KEY(projectId)
  const staleThreshold = Math.floor(Date.now() / 1000) - PROJECT_ONLINE_TTL
  await presenceRedis.zremrangebyscore(key, "-inf", staleThreshold)
  return presenceRedis.zrange(key, 0, -1)
}

async function broadcastProjectOnline(projectId: string, userIds: string[]): Promise<void> {
  const snapshot = JSON.stringify([...userIds].sort())
  lastOnlineSnapshot.set(projectId, snapshot)
  broadcast(projectId, { type: "project.online", userIds }).catch(() => {})
}

export function setupWebSocket(server: Server): void {
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379"
  publisher = new Redis(redisUrl)
  subscriber = new Redis(redisUrl)
  presenceRedis = new Redis(redisUrl)

  subscriber.on("message", (channel: string, raw: string) => {
    if (channel.startsWith("user:")) {
      const targetUserId = channel.replace("user:", "")
      const { event } = JSON.parse(raw) as { event: object }
      for (const client of clients) {
        if (client.userId === targetUserId && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify(event))
        }
      }
      return
    }

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

  const heartbeatInterval = setInterval(() => {
    for (const client of clients) {
      if (!client.isAlive) {
        client.ws.terminate()
        continue
      }
      client.isAlive = false
      client.ws.ping()
    }
  }, 10_000)

  // evict idle Yjs docs to prevent unbounded heap growth
  setInterval(async () => {
    const now = Date.now()
    for (const [taskId, entry] of yjsDocs) {
      if (now - entry.lastUsedAt > YJS_EVICT_IDLE_MS) {
        await flushAndEvictYjsDoc(taskId)
      }
    }
  }, 5 * 60 * 1000)

  // catches unreliable disconnects (browser kill, network drop) that don't fire ws.onclose
  const onlinePollInterval = setInterval(async () => {
    const activeProjectIds = new Set([...clients].map(c => c.projectId))
    for (const projectId of activeProjectIds) {
      try {
        const userIds = await getProjectOnline(projectId)
        const snapshot = JSON.stringify([...userIds].sort())
        if (lastOnlineSnapshot.get(projectId) !== snapshot) {
          await broadcastProjectOnline(projectId, userIds)
        }
      } catch {
        // ignore — next tick will retry
      }
    }
  }, 10_000)

  wss.on("close", () => {
    clearInterval(heartbeatInterval)
    clearInterval(onlinePollInterval)
    lastOnlineSnapshot.clear()
  })

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url!, "http://localhost")
    const projectId = url.searchParams.get("projectId")

    // primary: HttpOnly cookie (auto-sent on WS upgrade); fallback: token param for non-browser clients
    const cookieToken = Object.fromEntries(
      (req.headers.cookie ?? "").split(";").flatMap((c) => {
        const [k, ...v] = c.trim().split("=")
        return k ? [[k.trim(), v.join("=").trim()]] : []
      })
    ).token as string | undefined
    const token = cookieToken ?? url.searchParams.get("token") ?? undefined

    if (!token || !projectId) {
      ws.close(1008, "Missing token or projectId")
      return
    }

    let userId: string
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string; jti?: string }
      if (payload.jti && await isRevoked(payload.jti)) {
        ws.close(1008, "Token revoked")
        return
      }
      userId = payload.sub
    } catch {
      ws.close(1008, "Invalid token")
      return
    }

    const [userRow] = await db.select({ name: users.name }).from(users).where(inArray(users.id, [userId]))
    const userName = userRow?.name ?? "Unknown"

    const client: Client = { ws, userId, userName, projectId, currentMode: "viewing", isAlive: true, offlineSent: false }
    clients.add(client)

    ws.on("pong", () => { client.isAlive = true })

    const channel = `project:${projectId}`
    const isFirstLocal = [...clients].filter((c) => c.projectId === projectId).length === 1
    if (isFirstLocal) subscriber.subscribe(channel)

    const isFirstUserConn = [...clients].filter(c => c.userId === userId).length === 1
    if (isFirstUserConn) subscriber.subscribe(`user:${userId}`)

    await presenceRedis.zadd(PROJECT_ONLINE_KEY(projectId), Math.floor(Date.now() / 1000), userId).catch(() => {})

    {
      const onlineIds = await getProjectOnline(projectId).catch((): string[] => [userId])
      const snapshot = JSON.stringify([...onlineIds].sort())
      lastOnlineSnapshot.set(projectId, snapshot)

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "project.online", userIds: onlineIds }))
      }

      const projectClients = [...clients].filter(c => c.projectId === projectId)
      const taskGroups = new Map<string, { userId: string; name: string; mode: "viewing" | "editing" }[]>()
      for (const c of projectClients) {
        if (c.currentTaskId && c.userId !== userId) {
          const group = taskGroups.get(c.currentTaskId) ?? []
          if (!group.some(u => u.userId === c.userId)) group.push({ userId: c.userId, name: c.userName, mode: c.currentMode })
          taskGroups.set(c.currentTaskId, group)
        }
      }
      for (const [taskId, taskUsers] of taskGroups) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "presence.updated", taskId, users: taskUsers }))
        }
      }

      broadcast(projectId, { type: "project.online", userIds: onlineIds }).catch(() => {})
    }

    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString()) as {
          type: string
          taskId?: string
          mode?: string
          update?: string
        }

        // streaming and heartbeat messages are exempt from rate limiting
        const isStreamingMsg = msg.type === "yjs.update" || msg.type === "yjs.sync.request" || msg.type === "awareness.update" || msg.type === "project.ping"
        if (!isStreamingMsg) {
          const now = Date.now()
          const bucket = wsMessageCounts.get(userId) ?? { count: 0, resetAt: now + WS_RATE_WINDOW_MS }
          if (now > bucket.resetAt) { bucket.count = 0; bucket.resetAt = now + WS_RATE_WINDOW_MS }
          bucket.count++
          wsMessageCounts.set(userId, bucket)
          if (bucket.count > WS_RATE_MAX) {
            console.warn(`[WS backpressure] user=${userId} exceeded ${WS_RATE_MAX} msgs/${WS_RATE_WINDOW_MS}ms`)
            return
          }
        }

        if (msg.type === "presence.join" && msg.taskId) {
          if (client.currentTaskId && client.currentTaskId !== msg.taskId) {
            await removePresence(client.currentTaskId, userId)
            const prev = await getPresence(client.currentTaskId)
            broadcast(projectId, { type: "presence.updated", taskId: client.currentTaskId, users: prev }, userId).catch(() => {})
          }

          client.currentTaskId = msg.taskId
          await upsertPresence(msg.taskId, userId)
          const updated = await getPresence(msg.taskId)
          await publisher.publish(channel, JSON.stringify({
            event: { type: "presence.updated", taskId: msg.taskId, users: updated },
          }))
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "presence.updated", taskId: msg.taskId, users: updated }))
          }
        }

        if (msg.type === "presence.leave" && msg.taskId) {
          client.currentTaskId = undefined
          client.currentMode = "viewing"
          await removePresence(msg.taskId, userId)
          const updated = await getPresence(msg.taskId)
          broadcast(projectId, { type: "presence.updated", taskId: msg.taskId, users: updated }, userId).catch(() => {})
        }

        if (msg.type === "presence.ping" && msg.taskId) {
          await upsertPresence(msg.taskId, userId)
        }

        if (msg.type === "project.ping") {
          await presenceRedis.zadd(PROJECT_ONLINE_KEY(projectId), Math.floor(Date.now() / 1000), userId).catch(() => {})
        }

        if (msg.type === "presence.mode" && msg.taskId && msg.mode) {
          const mode = msg.mode as "viewing" | "editing"
          client.currentMode = mode
          broadcast(projectId, { type: "presence.mode", taskId: msg.taskId, userId, mode }, userId).catch(() => {})
          // full state corrects ordering races where presence.mode arrives before presence.updated
          const updated = await getPresence(msg.taskId)
          await publisher.publish(channel, JSON.stringify({
            event: { type: "presence.updated", taskId: msg.taskId, users: updated },
          }))
        }

        if (msg.type === "yjs.sync.request" && msg.taskId) {
          const doc = await getOrCreateYjsDoc(msg.taskId, projectId)
          const state = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64")
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "yjs.sync.init", taskId: msg.taskId, state }))
          }
        }

        if (msg.type === "yjs.update" && msg.taskId && msg.update) {
          const doc = await getOrCreateYjsDoc(msg.taskId, projectId)
          Y.applyUpdate(doc, Buffer.from(msg.update as string, "base64"))
          broadcast(projectId, { type: "yjs.update", taskId: msg.taskId, update: msg.update }).catch(() => {})
          scheduleYjsSave(msg.taskId)
        }

        if (msg.type === "awareness.update" && msg.taskId && msg.update) {
          broadcast(projectId, { type: "awareness.update", taskId: msg.taskId, update: msg.update }, userId).catch(() => {})
        }

        if (msg.type === "presence.offline") {
          client.offlineSent = true
          clients.delete(client)
          if (client.currentTaskId) {
            await removePresence(client.currentTaskId, userId).catch(() => {})
          }
          const userStillInProject = [...clients].some(c => c.userId === userId && c.projectId === projectId)
          if (!userStillInProject) {
            await presenceRedis.zrem(PROJECT_ONLINE_KEY(projectId), userId).catch(() => {})
          }
          const remaining = [...clients].filter(c => c.projectId === projectId)
          if (remaining.length === 0) subscriber.unsubscribe(channel)
          const userStillConnected = [...clients].some(c => c.userId === userId)
          if (!userStillConnected) subscriber.unsubscribe(`user:${userId}`)
          const onlineIds = await getProjectOnline(projectId).catch((): string[] => [])
          await broadcastProjectOnline(projectId, onlineIds)
        }
      } catch {
        // ignore malformed messages
      }
    })

    ws.on("close", async () => {
      clients.delete(client)
      const remaining = [...clients].filter(c => c.projectId === projectId)
      if (remaining.length === 0) subscriber.unsubscribe(channel)

      const userStillConnected = [...clients].some(c => c.userId === userId)
      if (!userStillConnected) subscriber.unsubscribe(`user:${userId}`)

      if (!client.offlineSent && client.currentTaskId) {
        await removePresence(client.currentTaskId, userId).catch(() => {})
        const updated = await getPresence(client.currentTaskId).catch((): never[] => [])
        broadcast(projectId, { type: "presence.updated", taskId: client.currentTaskId, users: updated }, userId).catch(() => {})
      }

      const userStillInProject = [...clients].some(c => c.userId === userId && c.projectId === projectId)
      if (!userStillInProject) {
        await presenceRedis.zrem(PROJECT_ONLINE_KEY(projectId), userId).catch(() => {})
      }

      const onlineIds = await getProjectOnline(projectId).catch((): string[] => [])
      await broadcastProjectOnline(projectId, onlineIds)
    })

    ws.on("error", () => clients.delete(client))
  })
}

export async function broadcast(projectId: string, event: object, senderId?: string): Promise<void> {
  await publisher.publish(`project:${projectId}`, JSON.stringify({ event, senderId }))
}

export async function sendToUser(userId: string, event: object): Promise<void> {
  await publisher.publish(`user:${userId}`, JSON.stringify({ event }))
}
