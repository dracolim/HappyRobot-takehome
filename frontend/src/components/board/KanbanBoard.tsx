"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { api } from "@/lib/api"
import { COLUMNS } from "@/lib/types"
import type { ProjectMember, Task, TaskStatus } from "@/lib/types"
import { KanbanColumn } from "./KanbanColumn"
import { TaskModal } from "./TaskModal"
import { TaskDetailModal, UpdatePayload } from "./TaskDetailModal"

interface Props {
  projectId: string
  projectName: string
}

function MembersPanel({
  projectId,
  members,
  onInvite,
  onRemove,
  currentUserId,
  isOwner,
}: {
  projectId: string
  members: ProjectMember[]
  onInvite: (email: string) => Promise<void>
  onRemove: (userId: string) => Promise<void>
  currentUserId: string | null
  isOwner: boolean
}) {
  const [email, setEmail] = useState("")
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState("")

  const handleInvite = async () => {
    const val = email.trim()
    if (!val) return
    setInviting(true)
    setError("")
    try {
      await onInvite(val)
      setEmail("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite")
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        {members.map((m) => (
          <div key={m.userId} className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[#0E0D0C] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
              {m.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#0E0D0C] truncate">{m.name}</p>
              <p className="text-[10px] text-[#0E0D0C]/40 truncate">{m.email}</p>
            </div>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${m.role === "owner" ? "bg-[#0E0D0C]/8 text-[#0E0D0C]/60" : "bg-black/5 text-[#0E0D0C]/40"}`}>
              {m.role}
            </span>
            {isOwner && m.userId !== currentUserId && (
              <button
                type="button"
                onClick={() => onRemove(m.userId)}
                className="text-[#0E0D0C]/20 hover:text-red-400 transition-colors text-sm leading-none shrink-0"
                title="Remove member"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {isOwner && (
        <div className="border-t border-black/[0.06] pt-3 flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#0E0D0C]/40">
            Invite by email
          </p>
          <div className="flex gap-1.5">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleInvite() }}
              placeholder="colleague@company.com"
              className="flex-1 text-xs border border-black/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-black/30 transition-colors"
            />
            <button
              type="button"
              onClick={handleInvite}
              disabled={inviting || !email.trim()}
              className="px-2.5 py-1.5 text-xs font-medium bg-[#0E0D0C] text-white rounded-lg hover:bg-black/80 disabled:opacity-40 transition-colors shrink-0"
            >
              {inviting ? "…" : "Invite"}
            </button>
          </div>
          {error && <p className="text-[10px] text-red-500">{error}</p>}
        </div>
      )}
    </div>
  )
}

export function KanbanBoard({ projectId, projectName }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [modalStatus, setModalStatus] = useState<TaskStatus | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [showMembers, setShowMembers] = useState(false)
  const membersPanelRef = useRef<HTMLDivElement>(null)

  const currentUserId = typeof window !== "undefined"
    ? (() => {
        try {
          const token = localStorage.getItem("token")
          if (!token) return null
          const payload = JSON.parse(atob(token.split(".")[1]))
          return payload.sub as string
        } catch { return null }
      })()
    : null

  const isOwner = members.find((m) => m.userId === currentUserId)?.role === "owner"

  useEffect(() => {
    api.tasks
      .list(projectId)
      .then((res) => setTasks(res.tasks))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => {
    api.members.list(projectId).then((res) => setMembers(res.members)).catch(() => {})
  }, [projectId])

  useEffect(() => {
    if (!showMembers) return
    const handler = (e: MouseEvent) => {
      if (membersPanelRef.current && !membersPanelRef.current.contains(e.target as Node)) {
        setShowMembers(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showMembers])

  const tasksByStatus = (status: TaskStatus) => tasks.filter((t) => t.status === status)

  const blockingCountMap = useMemo(() => {
    const map = new Map<string, number>()
    tasks.forEach((t) => {
      ;(t.dependencies ?? []).forEach((depId) => {
        map.set(depId, (map.get(depId) ?? 0) + 1)
      })
    })
    return map
  }, [tasks])

  const handleCreateTask = (data: {
    title: string
    priority: "low" | "medium" | "high" | "urgent"
    description: string
    tags: string[]
    assignedTo: string[]
    dependencyIds: string[]
  }) => {
    if (!modalStatus) return

    const optimistic: Task = {
      id: `temp-${Date.now()}`,
      projectId,
      title: data.title,
      status: modalStatus,
      assignedTo: data.assignedTo,
      configuration: {
        priority: data.priority,
        description: data.description,
        tags: data.tags,
        customFields: {},
      },
      dependencies: data.dependencyIds,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setTasks((prev) => [...prev, optimistic])
    setModalStatus(null)

    api.tasks
      .create(projectId, {
        title: data.title,
        status: modalStatus,
        assignedTo: data.assignedTo,
        configuration: {
          priority: data.priority,
          description: data.description,
          tags: data.tags,
          customFields: {},
        },
        dependencyIds: data.dependencyIds,
      })
      .then((res) => setTasks((prev) => prev.map((t) => (t.id === optimistic.id ? res.task : t))))
      .catch(() => setTasks((prev) => prev.filter((t) => t.id !== optimistic.id)))
  }

  const handleSaveTask = async (taskId: string, updates: UpdatePayload) => {
    const res = await api.tasks.update(projectId, taskId, updates as Partial<Task> & { dependencyIds?: string[] })
    setTasks((prev) => prev.map((t) => (t.id === taskId ? res.task : t)))
    setSelectedTask((prev) => (prev?.id === taskId ? res.task : prev))
  }

  const handleDeleteTask = async (taskId: string) => {
    await api.tasks.delete(projectId, taskId)
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    setSelectedTask(null)
  }

  const handleInvite = async (email: string) => {
    const res = await api.members.invite(projectId, email)
    setMembers((prev) => {
      const exists = prev.find((m) => m.userId === res.member.userId)
      return exists ? prev : [...prev, res.member]
    })
  }

  const handleRemoveMember = async (userId: string) => {
    await api.members.remove(projectId, userId)
    setMembers((prev) => prev.filter((m) => m.userId !== userId))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[#0E0D0C]/30 text-sm">
        Loading...
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-8 py-5 bg-white border-b border-black/[0.06]">
          <h1 className="text-base font-semibold text-[#0E0D0C]">{projectName}</h1>

          {/* Members */}
          <div className="relative" ref={membersPanelRef}>
            <button
              type="button"
              onClick={() => setShowMembers((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-black/5 transition-colors"
            >
              <div className="flex -space-x-2">
                {members.slice(0, 4).map((m) => (
                  <div
                    key={m.userId}
                    title={m.name}
                    className="w-7 h-7 rounded-full bg-[#0E0D0C] border-2 border-white flex items-center justify-center text-[10px] font-bold text-white"
                  >
                    {m.name[0]?.toUpperCase()}
                  </div>
                ))}
                {members.length > 4 && (
                  <div className="w-7 h-7 rounded-full bg-black/10 border-2 border-white flex items-center justify-center text-[9px] font-bold text-[#0E0D0C]/60">
                    +{members.length - 4}
                  </div>
                )}
              </div>
              {isOwner && (
                <span className="text-xs text-[#0E0D0C]/40 font-medium">Invite</span>
              )}
            </button>

            {showMembers && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-lg border border-black/[0.08] p-4 z-20">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#0E0D0C] mb-3">
                  Members · {members.length}
                </p>
                <MembersPanel
                  projectId={projectId}
                  members={members}
                  onInvite={handleInvite}
                  onRemove={handleRemoveMember}
                  currentUserId={currentUserId}
                  isOwner={isOwner}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-5 p-8 flex-1 min-w-0">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              label={col.label}
              status={col.id}
              tasks={tasksByStatus(col.id)}
              blockingCountMap={blockingCountMap}
              onAddTask={() => setModalStatus(col.id)}
              onSelectTask={(task) => setSelectedTask(task)}
            />
          ))}
        </div>
      </div>

      {modalStatus && (
        <TaskModal
          status={modalStatus}
          existingTasks={tasks}
          onClose={() => setModalStatus(null)}
          onSubmit={handleCreateTask}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          allTasks={tasks}
          onClose={() => setSelectedTask(null)}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
          onOpenTask={(t) => setSelectedTask(t)}
        />
      )}
    </>
  )
}
