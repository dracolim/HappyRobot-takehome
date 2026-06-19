"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core"
import { api } from "@/lib/api"
import { COLUMNS } from "@/lib/types"
import type { ProjectMember, Task, TaskStatus } from "@/lib/types"
import { useProjectSocket, type PresenceUser, type SocketEvent } from "@/lib/useProjectSocket"
import { KanbanColumn } from "./KanbanColumn"
import { TaskCard } from "./TaskCard"
import { TaskModal } from "./TaskModal"
import { TaskDetailModal, UpdatePayload } from "./TaskDetailModal"
import { ActivityFeed } from "../ActivityFeed"

interface Props {
  projectId: string
  projectName: string
  projectDescription?: string
  initialTaskId?: string
}

function MembersPanel({
  projectId,
  members,
  onInvite,
  onRemove,
  currentUserId,
  isOwner,
  onlineUserIds,
}: {
  projectId: string
  members: ProjectMember[]
  onInvite: (email: string) => Promise<void>
  onRemove: (userId: string) => Promise<void>
  currentUserId: string | null
  isOwner: boolean
  onlineUserIds: string[]
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
            <div className="relative shrink-0">
              <div className="w-7 h-7 rounded-full bg-[#0E0D0C] flex items-center justify-center text-[10px] font-bold text-white">
                {m.name[0]?.toUpperCase()}
              </div>
              {onlineUserIds.includes(m.userId) && (
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-green-400 border border-white" />
              )}
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

export function KanbanBoard({ projectId, projectName, projectDescription, initialTaskId }: Props) {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [modalStatus, setModalStatus] = useState<TaskStatus | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [showMembers, setShowMembers] = useState(false)
  const [presenceMap, setPresenceMap] = useState<Map<string, PresenceUser[]>>(new Map())
  const [realtimeComments, setRealtimeComments] = useState<import("@/lib/types").Comment[]>([])
  const [realtimeAttachments, setRealtimeAttachments] = useState<import("@/lib/types").Attachment[]>([])
  const [realtimeDeletedAttachmentIds, setRealtimeDeletedAttachmentIds] = useState<string[]>([])
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([])
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [dragError, setDragError] = useState<string | null>(null)
  const [showActivity, setShowActivity] = useState(false)
  const [latestEvent, setLatestEvent] = useState<SocketEvent | null>(null)
  const membersPanelRef = useRef<HTMLDivElement>(null)

  const [displayName, setDisplayName] = useState(projectName)
  const [displayDescription, setDisplayDescription] = useState(projectDescription ?? "")
  const [editingName, setEditingName] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [nameValue, setNameValue] = useState(projectName)
  const [descValue, setDescValue] = useState(projectDescription ?? "")

  const saveName = useCallback(async () => {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === displayName) { setEditingName(false); setNameValue(displayName); return }
    try {
      await api.projects.update(projectId, { name: trimmed })
      setDisplayName(trimmed)
      window.dispatchEvent(new CustomEvent("app:projectCreated"))
    } catch { setNameValue(displayName) }
    setEditingName(false)
  }, [nameValue, displayName, projectId])

  const saveDesc = useCallback(async () => {
    const trimmed = descValue.trim()
    if (trimmed === displayDescription) { setEditingDesc(false); return }
    try {
      await api.projects.update(projectId, { description: trimmed })
      setDisplayDescription(trimmed)
    } catch { setDescValue(displayDescription) }
    setEditingDesc(false)
  }, [descValue, displayDescription, projectId])

  const currentUserId = typeof window !== "undefined"
    ? (() => {
        try { return (JSON.parse(localStorage.getItem("currentUser") ?? "null") as { id?: string } | null)?.id ?? null }
        catch { return null }
      })()
    : null

  const isOwner = members.find((m) => m.userId === currentUserId)?.role === "owner"

  const yjsHandlerRef = useRef<((e: SocketEvent) => void) | null>(null)
  const registerYjsHandler = useCallback((handler: ((e: SocketEvent) => void) | null) => {
    yjsHandlerRef.current = handler
  }, [])

  const handleSocketEvent = useCallback((event: SocketEvent) => {
    if (event.type === "yjs.sync.init" || event.type === "yjs.update" || event.type === "awareness.update" || event.type === "presence.mode") {
      yjsHandlerRef.current?.(event)
      if (event.type !== "presence.mode") return
    }
    // Also forward presence.updated so useYjs can re-announce cursor state to new joiners.
    // The handler filters by taskId internally — forwarding all presence.updated is safe.
    if (event.type === "presence.updated") {
      yjsHandlerRef.current?.(event)
    }
    if (event.type === "task.created") {
      setTasks((prev) => [...prev, event.task])
    } else if (event.type === "task.updated") {
      setTasks((prev) => prev.map((t) => (t.id === event.task.id ? event.task : t)))
      setSelectedTask((prev) => (prev?.id === event.task.id ? event.task : prev))
    } else if (event.type === "task.deleted") {
      setTasks((prev) => prev.filter((t) => t.id !== event.taskId))
      setSelectedTask((prev) => (prev?.id === event.taskId ? null : prev))
    } else if (event.type === "comment.created") {
      setRealtimeComments((prev) => prev.some((c) => c.id === event.comment.id) ? prev : [...prev, event.comment])
      setTasks((prev) => prev.map((t) =>
        t.id === event.comment.taskId ? { ...t, commentCount: (t.commentCount ?? 0) + 1 } : t
      ))
    } else if (event.type === "attachment.created") {
      setRealtimeAttachments((prev) => prev.some((a) => a.id === event.attachment.id) ? prev : [...prev, event.attachment])
      setTasks((prev) => prev.map((t) => t.id === event.taskId ? { ...t, attachmentCount: (t.attachmentCount ?? 0) + 1 } : t))
    } else if (event.type === "attachment.deleted") {
      setRealtimeDeletedAttachmentIds((prev) => [...prev, event.attachmentId])
      setTasks((prev) => prev.map((t) => t.id === event.taskId ? { ...t, attachmentCount: Math.max(0, (t.attachmentCount ?? 0) - 1) } : t))
    } else if (event.type === "presence.updated") {
      setPresenceMap((prev) => {
        const next = new Map(prev)
        next.set(event.taskId, event.users.filter((u) => u.userId !== currentUserId))
        return next
      })
    } else if (event.type === "project.online") {
      setOnlineUserIds(event.userIds)
    } else if (event.type === "presence.mode") {
      setPresenceMap((prev) => {
        const next = new Map(prev)
        const users = next.get(event.taskId) ?? []
        next.set(event.taskId, users.map((u) => u.userId === event.userId ? { ...u, mode: event.mode } : u))
        return next
      })
    } else if (event.type === "notification.created") {
      window.dispatchEvent(new CustomEvent("app:notification", { detail: event.notification }))
    } else if (event.type === "project.updated") {
      setDisplayName(event.project.name)
      setNameValue(event.project.name)
      setDisplayDescription(event.project.description ?? "")
      setDescValue(event.project.description ?? "")
      window.dispatchEvent(new CustomEvent("app:projectCreated"))
    }
    setLatestEvent(event)
  }, [currentUserId])

  const { joinTask, leaveTask, heartbeat, sendRaw } = useProjectSocket({ projectId, onEvent: handleSocketEvent })

  useEffect(() => {
    api.tasks
      .list(projectId)
      .then((res) => {
        setTasks(res.tasks)
        if (initialTaskId) {
          const target = res.tasks.find((t) => t.id === initialTaskId)
          if (target) {
            setSelectedTask(target)
            router.replace(`/projects/${projectId}`)
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId, initialTaskId, router])

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
    files: File[]
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
      attachmentCount: 0,
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
      .then((res) => {
        setTasks((prev) => prev.map((t) => (t.id === optimistic.id ? res.task : t)))
        window.dispatchEvent(new CustomEvent("app:activityRefresh"))
        if (data.files.length > 0) {
          Promise.allSettled(data.files.map((f) => api.attachments.upload(res.task.id, f))).catch(() => {})
        }
      })
      .catch(() => setTasks((prev) => prev.filter((t) => t.id !== optimistic.id)))
  }

  const handleSaveTask = async (taskId: string, updates: UpdatePayload) => {
    try {
      const res = await api.tasks.update(projectId, taskId, updates as Parameters<typeof api.tasks.update>[2])
      setTasks((prev) => prev.map((t) => (t.id === taskId ? res.task : t)))
      setSelectedTask((prev) => (prev?.id === taskId ? res.task : prev))
      window.dispatchEvent(new CustomEvent("app:activityRefresh"))
    } catch (err) {
      if (err instanceof Error && err.message.includes("modified by someone else")) {
        // refresh so the modal shows the latest version before retrying
        api.tasks.list(projectId).then((res) => {
          setTasks(res.tasks)
          setSelectedTask(res.tasks.find((t) => t.id === taskId) ?? null)
        }).catch(() => {})
      }
      throw err
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    await api.tasks.delete(projectId, taskId)
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    setSelectedTask(null)
    window.dispatchEvent(new CustomEvent("app:activityRefresh"))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const activeDragBlockedByDeps = activeTask
    ? tasks.filter((t) => (activeTask.dependencies ?? []).includes(t.id) && t.status !== "done")
    : []

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveTask(tasks.find((t) => t.id === active.id) ?? null)
  }

  const showDragError = (msg: string) => {
    setDragError(msg)
    setTimeout(() => setDragError(null), 4000)
  }

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveTask(null)
    if (!over) return
    const newStatus = over.id as TaskStatus
    const task = tasks.find((t) => t.id === active.id)
    if (!task || task.status === newStatus) return

    if (newStatus === "done" && activeDragBlockedByDeps.length > 0) {
      showDragError(`Blocked by: ${activeDragBlockedByDeps.map((t) => t.title).join(", ")}`)
      return
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)))
    try {
      await api.tasks.update(projectId, task.id, { status: newStatus })
    } catch (err) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)))
      if (err instanceof Error) showDragError(err.message)
    }
  }

  const handleCommentPosted = (taskId: string) => {
    setTasks((prev) => prev.map((t) =>
      t.id === taskId ? { ...t, commentCount: (t.commentCount ?? 0) + 1 } : t
    ))
  }

  const handleAttachmentUploaded = (taskId: string) => {
    setTasks((prev) => prev.map((t) =>
      t.id === taskId ? { ...t, attachmentCount: (t.attachmentCount ?? 0) + 1 } : t
    ))
  }

  const handleAttachmentDeleted = (taskId: string) => {
    setTasks((prev) => prev.map((t) =>
      t.id === taskId ? { ...t, attachmentCount: Math.max(0, (t.attachmentCount ?? 0) - 1) } : t
    ))
  }

  const handleInvite = async (email: string) => {
    const res = await api.members.invite(projectId, { email })
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
          <div className="flex flex-col gap-0.5">
            {editingName ? (
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setEditingName(false); setNameValue(displayName) } }}
                className="text-base font-semibold text-[#0E0D0C] bg-transparent border-b border-black/20 outline-none w-64"
              />
            ) : (
              <h1
                className="text-base font-semibold text-[#0E0D0C] cursor-pointer hover:text-black/60 transition-colors"
                onClick={() => setEditingName(true)}
                title="Click to edit"
              >
                {displayName}
              </h1>
            )}
            {editingDesc ? (
              <input
                autoFocus
                value={descValue}
                onChange={(e) => setDescValue(e.target.value)}
                onBlur={saveDesc}
                onKeyDown={(e) => { if (e.key === "Enter") saveDesc(); if (e.key === "Escape") { setEditingDesc(false); setDescValue(displayDescription) } }}
                placeholder="Add a description..."
                className="text-xs text-[#0E0D0C]/50 bg-transparent border-b border-black/20 outline-none w-72"
              />
            ) : (
              <p
                className="text-xs text-[#0E0D0C]/40 cursor-pointer hover:text-[#0E0D0C]/60 transition-colors"
                onClick={() => setEditingDesc(true)}
                title="Click to edit"
              >
                {displayDescription || <span className="italic">Add a description...</span>}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Activity feed toggle */}
            <button
              type="button"
              onClick={() => setShowActivity(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showActivity ? "bg-black/[0.06] text-[#0E0D0C]" : "text-[#0E0D0C]/40 hover:bg-black/5 hover:text-[#0E0D0C]/70"}`}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M1 10h2M4 7h2M7 5h2M10 2h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Activity
            </button>

          {/* Members */}
          <div className="relative" ref={membersPanelRef}>
            <button
              type="button"
              onClick={() => setShowMembers((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-black/5 transition-colors"
            >
              <div className="flex -space-x-2">
                {members.slice(0, 4).map((m) => {
                  const isOnline = onlineUserIds.includes(m.userId)
                  return (
                    <div key={m.userId} className="relative" title={`${m.name}${isOnline ? " · online" : ""}`}>
                      <div className="w-7 h-7 rounded-full bg-[#0E0D0C] border-2 border-white flex items-center justify-center text-[10px] font-bold text-white">
                        {m.name[0]?.toUpperCase()}
                      </div>
                      {isOnline && (
                        <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-green-400 border border-white" />
                      )}
                    </div>
                  )
                })}
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
                  onlineUserIds={onlineUserIds}
                />
              </div>
            )}
          </div>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} collisionDetection={pointerWithin}>
          <div className="flex gap-5 p-8 flex-1 min-w-0 overflow-x-auto">
            {COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                label={col.label}
                status={col.id}
                tasks={tasksByStatus(col.id)}
                blockingCountMap={blockingCountMap}
                presenceMap={presenceMap}
                onAddTask={() => setModalStatus(col.id)}
                onSelectTask={(task) => setSelectedTask(task)}
                isBlockedByDeps={col.id === "done" && activeDragBlockedByDeps.length > 0}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask && (
              <TaskCard
                task={activeTask}
                blockingCount={blockingCountMap.get(activeTask.id) ?? 0}
                viewers={presenceMap.get(activeTask.id) ?? []}
              />
            )}
          </DragOverlay>
        </DndContext>

        {/* Activity feed side panel */}
        {showActivity && (
          <div className="w-72 shrink-0 border-l border-black/[0.06] bg-white flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-black/[0.06] flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-black/40">Activity</span>
              <button onClick={() => setShowActivity(false)} className="text-black/20 hover:text-black/50 transition-colors text-xs">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ActivityFeed
                projectId={projectId}
                latestEvent={latestEvent}
                onTaskClick={(taskId) => {
                  const task = tasks.find(t => t.id === taskId)
                  if (task) setSelectedTask(task)
                }}
              />
            </div>
          </div>
        )}

        {dragError && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#0E0D0C] text-white text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg pointer-events-none whitespace-nowrap">
            {dragError}
          </div>
        )}
        </div>
      </div>

      {modalStatus && (
        <TaskModal
          status={modalStatus}
          existingTasks={tasks}
          members={members}
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
          onJoinTask={joinTask}
          onLeaveTask={leaveTask}
          onHeartbeat={heartbeat}
          sendRaw={sendRaw}
          onRegisterYjsHandler={registerYjsHandler}
          viewers={presenceMap.get(selectedTask.id) ?? []}
          realtimeComments={realtimeComments.filter((c) => c.taskId === selectedTask.id)}
          onCommentPosted={handleCommentPosted}
          realtimeAttachments={realtimeAttachments.filter((a) => a.taskId === selectedTask.id)}
          realtimeDeletedAttachmentIds={realtimeDeletedAttachmentIds}
          members={members}
          onAttachmentUploaded={handleAttachmentUploaded}
          onAttachmentDeleted={handleAttachmentDeleted}
        />
      )}
    </>
  )
}
