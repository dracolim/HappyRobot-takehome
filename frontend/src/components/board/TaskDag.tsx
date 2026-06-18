"use client"

import { useEffect, useRef, useState } from "react"
import type { Task, TaskStatus } from "@/lib/types"

const statusConfig: Record<TaskStatus, { label: string; bg: string; text: string }> = {
  todo: { label: "To Do", bg: "bg-black/[0.06]", text: "text-[#0E0D0C]/60" },
  in_progress: { label: "In Progress", bg: "bg-blue-50", text: "text-blue-700" },
  in_review: { label: "In Review", bg: "bg-amber-50", text: "text-amber-700" },
  done: { label: "Completed", bg: "bg-green-50", text: "text-green-700" },
}

const priorityDot: Record<string, string> = {
  low: "bg-green-400",
  medium: "bg-yellow-400",
  high: "bg-orange-400",
  urgent: "bg-red-500",
}

interface Edge {
  x1: number; y1: number; x2: number; y2: number
}

interface NodeProps {
  task: Task
  isCurrent?: boolean
  ownDepCount?: number
  ownBlockingCount?: number
  onClick?: () => void
}

function DagNode({ task, isCurrent, ownDepCount = 0, ownBlockingCount = 0, onClick }: NodeProps) {
  const sc = statusConfig[task.status]
  const dot = priorityDot[task.configuration.priority]

  if (isCurrent) {
    return (
      <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl border border-[#0E0D0C] bg-[#0E0D0C] text-white w-[148px] shadow-md">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
          <span className="text-[10px] font-medium text-white/50 capitalize truncate">
            {task.configuration.priority}
          </span>
        </div>
        <p className="text-xs font-semibold leading-snug line-clamp-2 text-white">
          {task.title}
        </p>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/15 text-white self-start">
          {sc.label}
        </span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl border border-black/[0.08] bg-white w-[148px] hover:border-black/20 hover:shadow-sm transition-all text-left"
    >
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
        <span className="text-[10px] font-medium text-[#0E0D0C]/40 capitalize truncate">
          {task.configuration.priority}
        </span>
      </div>
      <p className="text-xs font-medium leading-snug line-clamp-2 text-[#0E0D0C]/80">
        {task.title}
      </p>
      <div className="flex items-center justify-between gap-1">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${sc.bg} ${sc.text}`}>
          {sc.label}
        </span>
        {(ownDepCount > 0 || ownBlockingCount > 0) && (
          <div className="flex items-center gap-1.5">
            {ownDepCount > 0 && (
              <span
                className="text-[9px] font-medium text-[#0E0D0C]/30"
                title={`Depends on ${ownDepCount} task${ownDepCount !== 1 ? "s" : ""}`}
              >
                ←{ownDepCount}
              </span>
            )}
            {ownBlockingCount > 0 && (
              <span
                className="text-[9px] font-medium text-amber-500/70"
                title={`Blocking ${ownBlockingCount} task${ownBlockingCount !== 1 ? "s" : ""}`}
              >
                {ownBlockingCount}→
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  )
}

interface Props {
  task: Task
  allTasks: Task[]
  onOpenTask: (task: Task) => void
}

// Fixed layout constants — must match the JSX below
const COL_W = 148
const PAD_X = 16
const NODE_H = 88
const GAP_Y = 12

// How many tasks in allTasks depend on the given taskId
function blockingCount(taskId: string, allTasks: Task[]): number {
  return allTasks.filter((t) => (t.dependencies ?? []).includes(taskId)).length
}

export function TaskDag({ task, allTasks, onOpenTask }: Props) {
  const deps = allTasks.filter((t) => (task.dependencies ?? []).includes(t.id))
  const dependents = allTasks.filter((t) => (t.dependencies ?? []).includes(task.id))

  const containerRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState<Edge[]>([])

  const rows = Math.max(deps.length, 1, dependents.length)
  const containerH = rows * NODE_H + (rows - 1) * GAP_Y + 40

  const depKey = `${task.id}|${deps.map((d) => d.id).join(",")}|${dependents.map((d) => d.id).join(",")}`

  useEffect(() => {
    if (!containerRef.current) return
    const containerW = containerRef.current.getBoundingClientRect().width
    if (!containerW) return

    // Pre-calculated x positions from the fixed layout
    const leftRightX = PAD_X + COL_W          // right edge of left column
    const rightLeftX = containerW - PAD_X - COL_W  // left edge of right column
    const centerLeftX = (containerW - COL_W) / 2
    const centerRightX = (containerW + COL_W) / 2
    const centerY = containerH / 2

    // Y center of the i-th node in a column of `count` nodes
    const nodeY = (count: number, i: number) => {
      const totalH = count * NODE_H + (count - 1) * GAP_Y
      const startY = (containerH - totalH) / 2
      return startY + i * (NODE_H + GAP_Y) + NODE_H / 2
    }

    const newEdges: Edge[] = []

    deps.forEach((_, i) => {
      newEdges.push({
        x1: leftRightX,
        y1: nodeY(deps.length, i),
        x2: centerLeftX,
        y2: centerY,
      })
    })

    dependents.forEach((_, i) => {
      newEdges.push({
        x1: centerRightX,
        y1: centerY,
        x2: rightLeftX,
        y2: nodeY(dependents.length, i),
      })
    })

    setEdges(newEdges)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, containerH])

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#0E0D0C] mb-2">
        Task Graph
      </p>

      {/* Column labels — outside the graph so they never overlap nodes */}
      <div className="flex mb-2" style={{ padding: `0 ${PAD_X}px` }}>
        <div className="shrink-0" style={{ width: COL_W }}>
          {deps.length > 0 && (
            <span className="text-[9px] font-semibold uppercase tracking-widest text-[#0E0D0C]/30">
              Depends On
            </span>
          )}
        </div>
        <div className="flex-1" />
        <div className="shrink-0 text-right" style={{ width: COL_W }}>
          {dependents.length > 0 && (
            <span className="text-[9px] font-semibold uppercase tracking-widest text-[#0E0D0C]/30">
              Blocking
            </span>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative rounded-2xl bg-black/[0.02] border border-black/[0.04]"
        style={{ height: containerH }}
      >
        <svg
          className="absolute inset-0 pointer-events-none"
          width="100%"
          height="100%"
        >
          <defs>
            <marker
              id="dag-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0.5 L0,7.5 L7,4 Z" fill="rgba(14,13,12,0.35)" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const cx = (e.x1 + e.x2) / 2
            return (
              <path
                key={i}
                d={`M${e.x1},${e.y1} C${cx},${e.y1} ${cx},${e.y2} ${e.x2},${e.y2}`}
                fill="none"
                stroke="rgba(14,13,12,0.25)"
                strokeWidth="1.5"
                markerEnd="url(#dag-arrow)"
              />
            )
          })}
        </svg>

        {/* Layout — PAD_X=16, COL_W=148, center node fills the middle flex-1 */}
        <div
          className="absolute inset-0 flex items-center"
          style={{ padding: `0 ${PAD_X}px` }}
        >
          {/* Left: upstream deps */}
          <div
            className="flex flex-col justify-center shrink-0"
            style={{ width: COL_W, gap: GAP_Y }}
          >
            {deps.map((dep) => (
              <DagNode
                key={dep.id}
                task={dep}
                ownDepCount={dep.dependencies?.length ?? 0}
                ownBlockingCount={blockingCount(dep.id, allTasks)}
                onClick={() => onOpenTask(dep)}
              />
            ))}
          </div>

          {/* Center: current task */}
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <DagNode task={task} isCurrent />
            {deps.length === 0 && dependents.length === 0 && (
              <p className="text-[10px] text-[#0E0D0C]/20">No dependencies</p>
            )}
          </div>

          {/* Right: downstream dependents */}
          <div
            className="flex flex-col justify-center shrink-0"
            style={{ width: COL_W, gap: GAP_Y }}
          >
            {dependents.map((dep) => (
              <DagNode
                key={dep.id}
                task={dep}
                ownDepCount={dep.dependencies?.length ?? 0}
                ownBlockingCount={blockingCount(dep.id, allTasks)}
                onClick={() => onOpenTask(dep)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
