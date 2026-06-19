"use client"

import { useEffect, useState, useCallback } from "react"
import { api } from "@/lib/api"
import type { ActivityEvent } from "@/lib/types"
import type { SocketEvent } from "@/lib/useProjectSocket"


function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function TypeIcon({ type }: { type: string }) {
  if (type === "task.created") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-black/25 shrink-0 mt-0.5">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M6 3.5v5M3.5 6h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    )
  }
  if (type === "task.comment") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-black/25 shrink-0 mt-0.5">
        <path d="M1.5 1.5h9a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H4l-2.5 2V2a.5.5 0 0 1 .5-.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      </svg>
    )
  }
  if (type === "task.deleted") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-black/25 shrink-0 mt-0.5">
        <path d="M2 3h8M4.5 3V2h3v1M5 5.5v3M7 5.5v3M3.5 3l.5 6.5h5L10 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
  return <span className="text-[10px] text-black/20 shrink-0 mt-0.5">•</span>
}

interface Props {
  projectId: string
  latestEvent: SocketEvent | null
  onTaskClick?: (taskId: string) => void
}

export function ActivityFeed({ projectId, latestEvent, onTaskClick }: Props) {
  const [items, setItems] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    api.activity.list(projectId)
      .then(res => setItems(res.events))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!latestEvent) return
    if (
      latestEvent.type === "task.created" ||
      latestEvent.type === "task.updated" ||
      latestEvent.type === "task.deleted" ||
      latestEvent.type === "comment.created"
    ) {
      load()
    }
  }, [latestEvent, load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener("app:activityRefresh", handler)
    return () => window.removeEventListener("app:activityRefresh", handler)
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-black/30">
        Loading…
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-black/30">
        No activity yet
      </div>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-black/[0.04]">
      {items.map(item => (
        <div
          key={item.id}
          className={`px-4 py-3 hover:bg-black/[0.02] transition-colors ${item.taskId && onTaskClick ? "cursor-pointer" : ""}`}
          onClick={() => item.taskId && onTaskClick?.(item.taskId)}
        >
          <div className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-full bg-black/[0.06] flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold text-black/50">
              {item.actorName?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-black/70 leading-snug">
                <span className="font-semibold text-black/80">{item.actorName}</span>
                {" "}{item.description}
                {item.taskTitle && (
                  <span className="font-medium text-black/60"> "{item.taskTitle}"</span>
                )}
              </p>
              <p className="text-[10px] text-black/30 mt-0.5">{timeAgo(item.createdAt)}</p>
            </div>
            <TypeIcon type={item.type} />
          </div>
        </div>
      ))}
    </div>
  )
}
