"use client"

import { useDroppable } from "@dnd-kit/core"
import type { Task, TaskStatus } from "@/lib/types"
import type { PresenceUser } from "@/lib/useProjectSocket"
import { TaskCard } from "./TaskCard"

const columnIcon: Record<TaskStatus, React.ReactNode> = {
  todo: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  ),
  in_progress: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M7.5 3v4.5l3 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  in_review: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M1.5 7.5C1.5 7.5 3.5 3 7.5 3s6 4.5 6 4.5-2 4.5-6 4.5-6-4.5-6-4.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <circle cx="7.5" cy="7.5" r="1.8" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  ),
  done: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M4.5 7.5l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
}

const columnColor: Record<TaskStatus, string> = {
  todo: "text-[#0E0D0C]/40",
  in_progress: "text-[#0E0D0C]/40",
  in_review: "text-[#0E0D0C]/40",
  done: "text-[#0E0D0C]/40",
}

interface Props {
  label: string
  status: TaskStatus
  tasks: Task[]
  blockingCountMap: Map<string, number>
  presenceMap: Map<string, PresenceUser[]>
  onAddTask: () => void
  onSelectTask: (task: Task) => void
  isBlockedByDeps?: boolean
}

export function KanbanColumn({ label, status, tasks, blockingCountMap, presenceMap, onAddTask, onSelectTask, isBlockedByDeps = false }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div ref={setNodeRef} className="flex flex-col flex-1 min-w-0">
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          <span className={columnColor[status]}>{columnIcon[status]}</span>
          <span className="text-sm font-semibold text-[#0E0D0C]/70 uppercase tracking-wider">{label}</span>
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

      <div className="flex flex-col gap-2.5 flex-1 min-h-20">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            blockingCount={blockingCountMap.get(task.id) ?? 0}
            viewers={presenceMap.get(task.id) ?? []}
            onClick={() => onSelectTask(task)}
            draggable
          />
        ))}

        {isOver && (
          isBlockedByDeps ? (
            <div className="rounded-xl border-2 border-dashed border-red-300 bg-red-50/60 h-[72px] shrink-0 flex items-center justify-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0 text-red-400">
                <path d="M6.5 1L12 11.5H1L6.5 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                <path d="M6.5 5.5v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <circle cx="6.5" cy="9.5" r="0.6" fill="currentColor"/>
              </svg>
              <span className="text-[11px] font-medium text-red-400">Dependencies not done</span>
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-[#0E0D0C]/20 h-[72px] shrink-0" />
          )
        )}
      </div>
    </div>
  )
}
