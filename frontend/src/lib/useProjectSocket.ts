"use client"

import { useEffect, useRef, useCallback } from "react"
import type { Task, Comment, Attachment } from "./types"

export interface PresenceUser {
  userId: string
  name: string
}

export type SocketEvent =
  | { type: "task.created"; task: Task }
  | { type: "task.updated"; task: Task }
  | { type: "task.deleted"; taskId: string }
  | { type: "comment.created"; comment: Comment }
  | { type: "presence.updated"; taskId: string; users: PresenceUser[] }
  | { type: "attachment.created"; taskId: string; attachment: Attachment }
  | { type: "attachment.deleted"; taskId: string; attachmentId: string }

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

    // function declaration is hoisted within this effect scope — safe to self-reference
    function connect() {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null
      if (!token) return

      const ws = new WebSocket(`${WS_URL}/ws?token=${token}&projectId=${projectId}`)
      wsRef.current = ws

      ws.onopen = () => {
        backoffRef.current = 1_000
      }

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data as string) as SocketEvent
          onEventRef.current(event)
        } catch {
          // ignore malformed
        }
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        reconnectTimer.current = setTimeout(() => {
          backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF)
          connect()
        }, backoffRef.current)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [projectId])

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const joinTask = useCallback((taskId: string) => {
    send({ type: "presence.join", taskId })
  }, [send])

  const leaveTask = useCallback((taskId: string) => {
    send({ type: "presence.leave", taskId })
  }, [send])

  const heartbeat = useCallback((taskId: string) => {
    send({ type: "presence.ping", taskId })
  }, [send])

  return { joinTask, leaveTask, heartbeat }
}
