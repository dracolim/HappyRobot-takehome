"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import type { Notification } from "@/lib/types"

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

interface Props {
  notifications: Notification[]
  onClose: () => void
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
}

export function NotificationPanel({ notifications, onClose, onMarkRead, onMarkAllRead }: Props) {
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [onClose])

  const handleNotificationClick = async (n: Notification) => {
    if (!n.read) {
      await api.notifications.markRead(n.id).catch(() => {})
      onMarkRead(n.id)
    }
    onClose()
    if (n.taskId) {
      router.push(`/projects/${n.projectId}?task=${n.taskId}`)
    }
  }

  const hasUnread = notifications.some(n => !n.read)

  return (
    <div
      ref={panelRef}
      className="absolute left-[calc(100%+8px)] top-0 w-72 bg-white rounded-xl shadow-lg border border-black/[0.07] z-50 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06]">
        <span className="text-xs font-semibold text-black/60 uppercase tracking-wider">Notifications</span>
        {hasUnread && (
          <button
            onClick={() => {
              api.notifications.markAllRead().catch(() => {})
              onMarkAllRead()
            }}
            className="text-[10px] text-black/40 hover:text-black/70 transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <p className="text-xs text-black/30 text-center py-8">No notifications yet</p>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`flex items-start gap-2.5 px-4 py-3 cursor-pointer hover:bg-black/[0.02] transition-colors border-b border-black/[0.04] last:border-0 ${!n.read ? "bg-blue-50/60" : ""}`}
            >
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold text-white">
                {(n.fromUserName ?? "?")[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-black/70 leading-snug">
                  <span className="font-semibold text-black/80">{n.fromUserName ?? "Someone"}</span>
                  {" "}{n.body}
                </p>
                <p className="text-[10px] text-black/30 mt-0.5">{timeAgo(n.createdAt)}</p>
              </div>
              {!n.read && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
