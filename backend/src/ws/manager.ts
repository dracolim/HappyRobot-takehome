import { WebSocketServer, WebSocket } from "ws"
import { Server } from "http"
import jwt from "jsonwebtoken"
import { Redis } from "ioredis"

interface Client {
  ws: WebSocket
  userId: string
  projectId: string
}

const clients = new Set<Client>()
let publisher: Redis
let subscriber: Redis

export function setupWebSocket(server: Server): void {
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379"
  publisher = new Redis(redisUrl)
  subscriber = new Redis(redisUrl)

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

  wss.on("connection", (ws, req) => {
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

    const client: Client = { ws, userId, projectId }
    clients.add(client)

    const channel = `project:${projectId}`
    const isFirstLocal = [...clients].filter((c) => c.projectId === projectId).length === 1
    if (isFirstLocal) subscriber.subscribe(channel)

    ws.on("close", () => {
      clients.delete(client)
      const remaining = [...clients].filter((c) => c.projectId === projectId)
      if (remaining.length === 0) subscriber.unsubscribe(channel)
    })

    ws.on("error", () => clients.delete(client))
  })
}

export async function broadcast(projectId: string, event: object, senderId?: string): Promise<void> {
  await publisher.publish(`project:${projectId}`, JSON.stringify({ event, senderId }))
}
