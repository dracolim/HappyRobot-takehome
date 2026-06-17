import type { Task } from "@/lib/types"

const priorityDot: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-green-400",
}

interface Props {
  task: Task
}

export function TaskCard({ task }: Props) {
  const priority = task.configuration.priority
  const tags = task.configuration.tags ?? []

  return (
    <div className="bg-white rounded-xl p-4 border border-black/[0.06] cursor-pointer hover:shadow-md hover:border-black/10 transition-all">
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className={`w-1.5 h-1.5 rounded-full ${priorityDot[priority] ?? "bg-gray-300"}`} />
        <span className="text-[11px] font-medium text-[#0E0D0C]/40 capitalize">{priority}</span>
      </div>

      <p className="text-sm font-medium text-[#0E0D0C] leading-snug mb-3">
        {task.title}
      </p>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-2 py-0.5 bg-black/5 text-[#0E0D0C]/50 rounded-md"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex -space-x-1.5">
          {task.assignedTo.slice(0, 3).map((userId) => (
            <div
              key={userId}
              className="w-6 h-6 rounded-full bg-[#0E0D0C] border-2 border-white flex items-center justify-center text-[10px] font-bold text-white"
            >
              {userId[0]?.toUpperCase()}
            </div>
          ))}
        </div>
        {task.dependencies.length > 0 && (
          <span className="text-[11px] text-[#0E0D0C]/30">{task.dependencies.length} deps</span>
        )}
      </div>
    </div>
  )
}
