import type { Task, TaskStatus } from "@/lib/types"
import type { PresenceUser } from "@/lib/useProjectSocket"

const priorityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: "bg-green-50", text: "text-green-700" },
  medium: { bg: "bg-yellow-50", text: "text-yellow-700" },
  high: { bg: "bg-orange-50", text: "text-orange-700" },
  urgent: { bg: "bg-red-50", text: "text-red-600" },
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
  onClick: () => void
}

export function TaskCard({ task, blockingCount, viewers, onClick }: Props) {
  const priority = task.configuration.priority
  const description = task.configuration.description ?? ""
  const depCount = (task.dependencies?.length ?? 0) + blockingCount
  const commentCount = task.commentCount ?? 0
  const pc = priorityColors[priority] ?? priorityColors.medium
  const sc = statusColors[task.status]

  const hasViewers = viewers.length > 0

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl p-4 border cursor-pointer hover:shadow-md transition-all ${hasViewers ? "border-blue-400 shadow-sm shadow-blue-100" : "border-black/[0.06] hover:border-black/10"}`}
    >
      {hasViewers && (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          <div className="flex -space-x-1">
            {viewers.slice(0, 3).map((v) => (
              <div
                key={v.userId}
                title={`${v.name} is viewing`}
                className="w-5 h-5 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-[8px] font-bold text-white shrink-0"
              >
                {v.name[0]?.toUpperCase()}
              </div>
            ))}
          </div>
          <span className="text-[10px] text-blue-500 font-medium">
            {viewers.length === 1 ? `${viewers[0].name} is viewing` : `${viewers.length} viewing`}
          </span>
        </div>
      )}
      {/* Top badges */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md capitalize ${pc.bg} ${pc.text}`}>
          {priority}
        </span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${sc.bg} ${sc.text}`}>
          {statusShort[task.status]}
        </span>
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-[#0E0D0C] leading-snug mb-1.5">
        {task.title}
      </p>

      {/* Description preview */}
      {description && (
        <p className="text-xs text-[#0E0D0C]/40 leading-relaxed line-clamp-2 mb-3">
          {description}
        </p>
      )}

      {/* Footer */}
      <div className={`flex items-center justify-between gap-2 ${description ? "" : "mt-3"}`}>
        {/* Left: dep count + comment count */}
        <div className="flex items-center gap-3">
          {depCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-[#0E0D0C]/35">
              {/* Chain link icon */}
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="shrink-0">
                <path d="M5.5 8.5a3 3 0 0 0 4.243 0l1.414-1.414a3 3 0 0 0-4.243-4.243L6.086 4.17" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M8.5 5.5a3 3 0 0 0-4.243 0L2.843 6.914a3 3 0 0 0 4.243 4.243L7.914 9.83" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              {depCount}
            </span>
          )}
          {commentCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-[#0E0D0C]/35">
              {/* Speech bubble icon */}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
                <path d="M10 1H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1.5L6 11l2.5-2H10a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
              {commentCount}
            </span>
          )}
        </div>

        {/* Right: stacked assignee avatars */}
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
}
