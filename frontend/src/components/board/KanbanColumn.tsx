import type { Task, TaskStatus } from "@/lib/types"
import type { PresenceUser } from "@/lib/useProjectSocket"
import { TaskCard } from "./TaskCard"

const columnDot: Record<TaskStatus, string> = {
  todo: "bg-[#0E0D0C]/20",
  in_progress: "bg-[#0E0D0C]/60",
  done: "bg-[#0E0D0C]",
  in_review: "bg-[#0E0D0C]/40",
}

interface Props {
  label: string
  status: TaskStatus
  tasks: Task[]
  blockingCountMap: Map<string, number>
  presenceMap: Map<string, PresenceUser[]>
  onAddTask: () => void
  onSelectTask: (task: Task) => void
}

export function KanbanColumn({ label, status, tasks, blockingCountMap, presenceMap, onAddTask, onSelectTask }: Props) {
  return (
    <div className="flex flex-col flex-1 min-w-0">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${columnDot[status]}`} />
          <span className="text-xs font-semibold text-[#0E0D0C]/60 uppercase tracking-wide">{label}</span>
          <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-black/5 text-[#0E0D0C]/50">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={onAddTask}
          className="text-[#0E0D0C]/30 hover:text-[#0E0D0C]/60 transition-colors text-lg leading-none"
        >
          +
        </button>
      </div>

      <div className="flex flex-col gap-2.5 min-h-20">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            blockingCount={blockingCountMap.get(task.id) ?? 0}
            viewers={presenceMap.get(task.id) ?? []}
            onClick={() => onSelectTask(task)}
          />
        ))}
      </div>
    </div>
  )
}
