"use client"

import { useEffect, useRef } from "react"
import type { Notification } from "./types"

export type UserSocketEvent =
  | { type: "member.added"; projectId: string; member: { userId: string; name: string; email: string; role: string } }
  | { type: "member.removed"; projectId: string; userId: string }
  | { type: "project.deleted"; projectId: string }
  | { type: "notification.created"; notification: Notification & { fromUserName?: string } }

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080"
const MAX_BACKOFF = 30_000

export function useUserSocket(onEvent: (event: UserSocketEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const backoffRef = useRef(1_000)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const onEventRef = useRef(onEvent)

  useEffect(() => { onEventRef.current = onEvent }, [onEvent])

  useEffect(() => {
    mountedRef.current = true

    function connect() {
      if (!localStorage.getItem("currentUser")) return
      const ws = new WebSocket(`${WS_URL}/ws?projectId=__user__`)
      wsRef.current = ws

      ws.onopen = () => { backoffRef.current = 1_000 }

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data as string) as UserSocketEvent
          onEventRef.current(event)
        } catch {}
      }

      ws.onclose = (event) => {
        if (!mountedRef.current) return
        if (event.code === 1008) return
        reconnectTimer.current = setTimeout(() => {
          backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF)
          connect()
        }, backoffRef.current)
      }

      ws.onerror = () => ws.close()
    }

    const closeNow = () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }

    window.addEventListener("app:logout", closeNow)
    connect()

    return () => {
      window.removeEventListener("app:logout", closeNow)
      closeNow()
    }
  }, [])
}
