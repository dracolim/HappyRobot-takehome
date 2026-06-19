"use client"

import { useEffect, useRef, useCallback } from "react"
import type { Task, Comment, Attachment, Project, ProjectMember } from "./types"
import { isActive } from "./activityTracker"

export interface PresenceUser {
  userId: string
  name: string
  mode?: "viewing" | "editing"
}

export type SocketEvent =
  | { type: "task.created"; task: Task }
  | { type: "task.updated"; task: Task }
  | { type: "task.deleted"; taskId: string }
  | { type: "comment.created"; comment: Comment }
  | { type: "presence.updated"; taskId: string; users: PresenceUser[] }
  | { type: "attachment.created"; taskId: string; attachment: Attachment; attachmentCount: number }
  | { type: "attachment.deleted"; taskId: string; attachmentId: string }
  | { type: "yjs.sync.init"; taskId: string; state: string }
  | { type: "yjs.update"; taskId: string; update: string }
  | { type: "awareness.update"; taskId: string; update: string }
  | { type: "project.online"; userIds: string[] }
  | { type: "project.updated"; project: Project }
  | { type: "member.added"; projectId: string; member: ProjectMember }
  | { type: "member.removed"; projectId: string; userId: string }
  | { type: "presence.mode"; taskId: string; userId: string; mode: "viewing" | "editing" }
  | { type: "notification.created"; notification: import("./types").Notification & { fromUserName?: string } }

interface Options {
  projectId: string
  onEvent: (event: SocketEvent) => void
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080"
const MAX_BACKOFF = 30_000

export function useProjectSocket({ projectId, onEvent }: Options) {
  const wsRef = useRef<WebSocket | null>(null)
  const backoffRef = useRef(1_000)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const onEventRef = useRef(onEvent)

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    mountedRef.current = true

    function connect() {
      // skip if not logged in — prevents infinite reconnect before the auth redirect fires
      if (!localStorage.getItem("currentUser")) return

      const ws = new WebSocket(`${WS_URL}/ws?projectId=${projectId}`)
      wsRef.current = ws

      ws.onopen = () => {
        backoffRef.current = 1_000
        // open modals must re-announce presence — server's client object is fresh after reconnect
        window.dispatchEvent(new CustomEvent("ws:reconnected"))
      }

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data as string) as SocketEvent
          onEventRef.current(event)
        } catch {
          // ignore malformed
        }
      }

      ws.onclose = (event) => {
        if (!mountedRef.current) return
        // 1008 = auth rejected (bad/revoked token) — stop retrying
        if (event.code === 1008) return
        reconnectTimer.current = setTimeout(() => {
          backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF)
          connect()
        }, backoffRef.current)
      }

      ws.onerror = () => ws.close()
    }

    const sendOfflineAndClose = (ws: WebSocket | null) => {
      if (ws?.readyState === WebSocket.OPEN) {
        // data frame arrives before the WS close handshake — server acts immediately even on tab kill
        ws.send(JSON.stringify({ type: "presence.offline" }))
      }
      ws?.close()
    }

    const closeNow = () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      sendOfflineAndClose(wsRef.current)
    }

    const handleUnload = () => sendOfflineAndClose(wsRef.current)

    window.addEventListener("app:logout", closeNow)
    window.addEventListener("beforeunload", handleUnload)
    connect()

    const pingInterval = setInterval(() => {
      if (isActive() && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "project.ping" }))
      }
    }, 30_000)

    return () => {
      window.removeEventListener("app:logout", closeNow)
      window.removeEventListener("beforeunload", handleUnload)
      clearInterval(pingInterval)
      closeNow()
    }
  }, [projectId])

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const joinTask = useCallback((taskId: string, mode?: "viewing" | "editing") => {
    send({ type: "presence.join", taskId, ...(mode ? { mode } : {}) })
  }, [send])

  const leaveTask = useCallback((taskId: string) => {
    send({ type: "presence.leave", taskId })
  }, [send])

  const heartbeat = useCallback((taskId: string) => {
    send({ type: "presence.ping", taskId })
  }, [send])

  return { joinTask, leaveTask, heartbeat, sendRaw: send }
}
