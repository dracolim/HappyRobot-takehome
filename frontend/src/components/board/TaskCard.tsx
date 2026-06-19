"use client"

import { memo } from "react"
import { useDraggable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import type { Task, TaskStatus } from "@/lib/types"
import type { PresenceUser } from "@/lib/useProjectSocket"

const flagIcon = (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M2 1.5h6v5L5 5l-3 1.5V1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    <path d="M2 9V1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
)

const priorityConfig: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  low:    { bg: "bg-green-50",  text: "text-green-700",  icon: flagIcon },
  medium: { bg: "bg-yellow-50", text: "text-yellow-700", icon: flagIcon },
  high:   { bg: "bg-orange-50", text: "text-orange-700", icon: flagIcon },
  urgent: { bg: "bg-red-50",    text: "text-red-600",    icon: flagIcon },
}

const statusShort: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "Review",
  done: "Done",
}

const statusColors: Record<TaskStatus, { bg: string; text: string }> = {
  todo: { bg: "bg-black/[0.05]", text: "text-[#0E0D0C]/50" },
  in_progress: { bg: "bg-blue-50", text: "text-blue-600" },
  in_review: { bg: "bg-amber-50", text: "text-amber-600" },
  done: { bg: "bg-green-50", text: "text-green-600" },
}

interface Props {
  task: Task
  blockingCount: number
  viewers: PresenceUser[]
  onSelect?: (task: Task) => void
  draggable?: boolean
}

export const TaskCard = memo(function TaskCard({ task, blockingCount, viewers, onSelect, draggable = false }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: !draggable,
  })

  const priority = task.configuration.priority
  const tags = task.configuration.tags ?? []
  const depCount = (task.dependencies?.length ?? 0) + blockingCount
  const commentCount = task.commentCount ?? 0
  const attachmentCount = task.attachmentCount ?? 0
  const pc = priorityConfig[priority] ?? priorityConfig.medium
  const sc = statusColors[task.status]
  const hasViewers = viewers.length > 0

  return (
    <div
      ref={setNodeRef}
      style={{ transform: isDragging ? undefined : CSS.Transform.toString(transform), opacity: isDragging ? 0 : 1 }}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      onClick={() => onSelect?.(task)}
      className={`bg-white rounded-xl p-5 border cursor-pointer hover:shadow-md transition-all ${hasViewers ? "border-blue-400 shadow-sm shadow-blue-100" : "border-black/[0.06] hover:border-black/10"}`}
    >
      {hasViewers && (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          <div className="flex -space-x-1">
            {viewers.slice(0, 3).map((v) => (
              <div
                key={v.userId}
                title={`${v.name} is ${v.mode === "editing" ? "editing" : "viewing"}`}
                className="w-5 h-5 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-[8px] font-bold text-white shrink-0"
              >
                {v.name[0]?.toUpperCase()}
              </div>
            ))}
          </div>
          <span className="text-[10px] text-blue-500 font-medium">
            {viewers.length === 1
              ? `${viewers[0].name} is ${viewers[0].mode === "editing" ? "editing" : "viewing"}`
              : (() => {
                  const editors = viewers.filter(v => v.mode === "editing")
                  if (editors.length === viewers.length) return `${viewers.length} editing`
                  if (editors.length === 0) return `${viewers.length} viewing`
                  return `${editors.length} editing, ${viewers.length - editors.length} viewing`
                })()
            }
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 mb-3">
        <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md capitalize ${pc.bg} ${pc.text}`}>
          {pc.icon}
          {priority}
        </span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${sc.bg} ${sc.text}`}>
          {statusShort[task.status]}
        </span>
      </div>

      <p className="text-sm font-semibold text-[#0E0D0C] leading-snug mb-2">
        {task.title}
      </p>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-md border border-black/[0.08] text-[#0E0D0C]/45 font-medium">
              {tag}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md border border-black/[0.08] text-[#0E0D0C]/30">
              +{tags.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-3">
        <div className="flex items-center gap-3">
          {depCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-[#0E0D0C]/35">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="shrink-0">
                <path d="M5.5 8.5a3 3 0 0 0 4.243 0l1.414-1.414a3 3 0 0 0-4.243-4.243L6.086 4.17" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M8.5 5.5a3 3 0 0 0-4.243 0L2.843 6.914a3 3 0 0 0 4.243 4.243L7.914 9.83" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              {depCount}
            </span>
          )}
          {commentCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-[#0E0D0C]/35">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
                <path d="M10 1H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1.5L6 11l2.5-2H10a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
              {commentCount}
            </span>
          )}
          {attachmentCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-[#0E0D0C]/35">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
                <path d="M9.5 6.5L5 11A3 3 0 0 1 .757 6.757L5.5 2a2 2 0 0 1 2.828 2.828L3.914 9.243a1 1 0 0 1-1.414-1.414L7 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {attachmentCount}
            </span>
          )}
        </div>

        <div className="flex -space-x-1.5 ml-auto">
          {task.assignedTo.slice(0, 3).map((name) => (
            <div
              key={name}
              title={name}
              className="w-6 h-6 rounded-full bg-[#0E0D0C] border-2 border-white flex items-center justify-center text-[9px] font-bold text-white shrink-0"
            >
              {name[0]?.toUpperCase()}
            </div>
          ))}
          {task.assignedTo.length > 3 && (
            <div className="w-6 h-6 rounded-full bg-black/10 border-2 border-white flex items-center justify-center text-[9px] font-medium text-[#0E0D0C]/50 shrink-0">
              +{task.assignedTo.length - 3}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
