"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { Comment, Task, TaskStatus } from "@/lib/types"
import { TaskDag } from "./TaskDag"

export interface UpdatePayload {
  title?: string
  status?: TaskStatus
  assignedTo?: string[]
  dependencyIds?: string[]
  updatedAt?: string
  configuration?: {
    priority?: "low" | "medium" | "high" | "urgent"
    description?: string
    tags?: string[]
    customFields?: Record<string, unknown>
  }
}

interface Props {
  task: Task
  allTasks: Task[]
  onClose: () => void
  onSave: (taskId: string, updates: UpdatePayload) => Promise<void>
  onDelete: (taskId: string) => Promise<void>
  onOpenTask: (task: Task) => void
  onJoinTask: (taskId: string) => void
  onLeaveTask: (taskId: string) => void
  onHeartbeat: (taskId: string) => void
  viewers: { userId: string; name: string }[]
  realtimeComments: Comment[]
}

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ["in_progress"],
  in_progress: ["in_review", "todo"],
  in_review: ["done", "in_progress"],
  done: ["in_review"],
}

const statusConfig: Record<TaskStatus, { label: string; bg: string; text: string }> = {
  todo: { label: "To Do", bg: "bg-black/[0.06]", text: "text-[#0E0D0C]/60" },
  in_progress: { label: "In Progress", bg: "bg-blue-50", text: "text-blue-700" },
  in_review: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700" },
  done: { label: "Completed", bg: "bg-green-50", text: "text-green-700" },
}

const priorityDot: Record<string, string> = {
  low: "bg-green-400",
  medium: "bg-yellow-400",
  high: "bg-orange-400",
  urgent: "bg-red-500",
}

const PRIORITIES = ["low", "medium", "high", "urgent"] as const

export function TaskDetailModal({ task, allTasks, onClose, onSave, onDelete, onOpenTask, onJoinTask, onLeaveTask, onHeartbeat, viewers, realtimeComments }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [editPriority, setEditPriority] = useState(task.configuration.priority)
  const [editDescription, setEditDescription] = useState(task.configuration.description ?? "")
  const [editTagInput, setEditTagInput] = useState("")
  const [editTags, setEditTags] = useState<string[]>(task.configuration.tags ?? [])
  const [editAssigneeInput, setEditAssigneeInput] = useState("")
  const [editAssignedTo, setEditAssignedTo] = useState<string[]>(task.assignedTo ?? [])
  const [editDependencyIds, setEditDependencyIds] = useState<string[]>(task.dependencies ?? [])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [transitioning, setTransitioning] = useState<TaskStatus | null>(null)
  const [commentsList, setCommentsList] = useState<Comment[]>([])
  const [commentInput, setCommentInput] = useState("")
  const [postingComment, setPostingComment] = useState(false)
  const commentsEndRef = useRef<HTMLDivElement>(null)

  const otherTasks = allTasks.filter((t) => t.id !== task.id)
  const validTransitions = VALID_TRANSITIONS[task.status] ?? []
  const cfg = statusConfig[task.status]
  const blockingTasks = allTasks.filter(
    (t) => (task.dependencies ?? []).includes(t.id) && t.status !== "done"
  )

  // merge fetched + realtime comments, deduped — computed at render, no setState-in-effect needed
  const allComments = useMemo(() => {
    const ids = new Set(commentsList.map((c) => c.id))
    return [...commentsList, ...realtimeComments.filter((c) => !ids.has(c.id))]
  }, [commentsList, realtimeComments])

  useEffect(() => {
    api.comments.list(task.id).then((res) => setCommentsList(res.comments)).catch(() => {})
  }, [task.id])

  // presence: join on open, leave on close, heartbeat every 15s
  useEffect(() => {
    onJoinTask(task.id)
    return () => onLeaveTask(task.id)
  }, [task.id, onJoinTask, onLeaveTask])

  useEffect(() => {
    const id = setInterval(() => onHeartbeat(task.id), 15_000)
    return () => clearInterval(id)
  }, [task.id, onHeartbeat])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onEsc)
    return () => window.removeEventListener("keydown", onEsc)
  }, [onClose])

  const cancelEdit = () => {
    setEditTitle(task.title)
    setEditPriority(task.configuration.priority)
    setEditDescription(task.configuration.description ?? "")
    setEditTags(task.configuration.tags ?? [])
    setEditTagInput("")
    setEditAssignedTo(task.assignedTo ?? [])
    setEditAssigneeInput("")
    setEditDependencyIds(task.dependencies ?? [])
    setIsEditing(false)
  }

  const addTag = () => {
    const tag = editTagInput.trim().replace(/,$/, "")
    if (tag && !editTags.includes(tag)) setEditTags((prev) => [...prev, tag])
    setEditTagInput("")
  }

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag() }
    if (e.key === "Backspace" && !editTagInput && editTags.length > 0)
      setEditTags((prev) => prev.slice(0, -1))
  }

  const addAssignee = () => {
    const val = editAssigneeInput.trim()
    if (val && !editAssignedTo.includes(val)) setEditAssignedTo((prev) => [...prev, val])
    setEditAssigneeInput("")
  }

  const handleAssigneeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addAssignee() }
    if (e.key === "Backspace" && !editAssigneeInput && editAssignedTo.length > 0)
      setEditAssignedTo((prev) => prev.slice(0, -1))
  }

  const toggleDep = (id: string) => {
    setEditDependencyIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    )
  }

  const handleTransition = async (newStatus: TaskStatus) => {
    setSaveError(null)
    setTransitioning(newStatus)
    try {
      await onSave(task.id, { status: newStatus, updatedAt: task.updatedAt })
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update")
    } finally {
      setTransitioning(null)
    }
  }

  const handleSave = async () => {
    setSaveError(null)
    setSaving(true)
    try {
      await onSave(task.id, {
        title: editTitle,
        assignedTo: editAssignedTo,
        dependencyIds: editDependencyIds,
        updatedAt: task.updatedAt,
        configuration: {
          priority: editPriority,
          description: editDescription,
          tags: editTags,
          customFields: task.configuration.customFields,
        },
      })
      setIsEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    await onDelete(task.id).finally(() => setDeleting(false))
    onClose()
  }

  const handlePostComment = async () => {
    const text = commentInput.trim()
    if (!text || postingComment) return
    setPostingComment(true)
    setCommentInput("")
    try {
      await api.comments.create(task.id, text)
      const res = await api.comments.list(task.id)
      setCommentsList(res.comments)
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
    } finally {
      setPostingComment(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl h-[700px] flex flex-col">

        {/* Header — full width */}
        <div className="px-6 pt-6 pb-4 border-b border-black/[0.06] shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-medium px-2 py-1 rounded-md ${cfg.bg} ${cfg.text}`}>
              {cfg.label}
            </span>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border border-black/10 text-[#0E0D0C]/60 rounded-lg hover:bg-black/5 transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !editTitle.trim()}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-[#0E0D0C] text-white rounded-lg hover:bg-black/80 disabled:opacity-40 transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {saving ? "Saving…" : "Save"}
                  </button>
                </>
              ) : (
                <>
                  {confirmDelete ? (
                    <>
                      <span className="text-xs text-[#0E0D0C]/50 mr-1">Delete?</span>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="text-xs font-medium px-3 py-1.5 border border-black/10 text-[#0E0D0C]/60 rounded-lg hover:bg-black/5 transition-colors"
                      >
                        No
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="text-xs font-medium px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-40 transition-colors"
                      >
                        {deleting ? "Deleting…" : "Yes, delete"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border border-black/10 text-[#0E0D0C]/40 rounded-lg hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2 3h8M5 3V2h2v1M4.5 3l.5 7h2l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setIsEditing(true); setConfirmDelete(false) }}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-[#0E0D0C] text-white rounded-lg hover:bg-black/80 transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M8.5 1.5a1.414 1.414 0 0 1 2 2L4 10H2v-2L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                    </svg>
                    Edit
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="text-[#0E0D0C]/30 hover:text-[#0E0D0C]/70 transition-colors text-xl leading-none ml-1"
              >
                ×
              </button>
            </div>
          </div>
          {isEditing ? (
            <input
              autoFocus
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full text-xl font-semibold text-[#0E0D0C] outline-none"
            />
          ) : (
            <h2 className="text-xl font-semibold text-[#0E0D0C]">{task.title}</h2>
          )}
        </div>

        {/* Viewers banner */}
        {viewers.length > 0 && (
          <div className="flex items-center gap-2 px-6 py-2 bg-blue-50 border-b border-blue-100">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <div className="flex -space-x-1">
              {viewers.slice(0, 3).map((v) => (
                <div key={v.userId} title={v.name} className="w-5 h-5 rounded-full bg-blue-500 border-2 border-blue-50 flex items-center justify-center text-[8px] font-bold text-white">
                  {v.name[0]?.toUpperCase()}
                </div>
              ))}
            </div>
            <span className="text-xs text-blue-600">
              {viewers.length === 1 ? `${viewers[0].name} is also viewing` : `${viewers.length} others are viewing`}
            </span>
          </div>
        )}

        {/* Save conflict error */}
        {saveError && (
          <div className="flex items-center justify-between px-6 py-2 bg-red-50 border-b border-red-100">
            <span className="text-xs text-red-600">{saveError}</span>
            <button type="button" onClick={() => setSaveError(null)} className="text-red-400 hover:text-red-600 text-sm leading-none">×</button>
          </div>
        )}

        {/* Two-column body */}
        <div className="flex flex-1 min-h-0">

          {/* Left — task details */}
          <div className="flex-1 px-6 py-5 space-y-5 overflow-y-auto thin-scroll border-r border-black/[0.06]">

            {/* Status transitions */}
            {validTransitions.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#0E0D0C] mb-2">
                  Move To
                </p>
                <div className="flex gap-2 flex-wrap">
                  {validTransitions.map((s) => {
                    const sc = statusConfig[s]
                    const isBlocked = s === "done" && blockingTasks.length > 0
                    return (
                      <button
                        key={s}
                        onClick={() => !isBlocked && handleTransition(s)}
                        disabled={transitioning !== null || isBlocked}
                        title={isBlocked ? `Blocked by: ${blockingTasks.map((t) => t.title).join(", ")}` : undefined}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${sc.bg} ${sc.text} border-current/20 hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        {transitioning === s ? "Moving…" : sc.label}
                      </button>
                    )
                  })}
                </div>
                {blockingTasks.length > 0 && validTransitions.includes("done") && (
                  <div className="mt-2 flex flex-col gap-1">
                    {blockingTasks.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 text-xs text-[#0E0D0C]/50">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        <span className="truncate">{t.title}</span>
                        <span className="ml-auto shrink-0 capitalize">{t.status.replace("_", " ")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Priority */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#0E0D0C] mb-2">
                Priority
              </p>
              {isEditing ? (
                <div className="flex gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setEditPriority(p)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${
                        editPriority === p
                          ? "border-[#0E0D0C] bg-[#0E0D0C] text-white"
                          : "border-black/10 text-[#0E0D0C]/50 hover:border-black/20"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${priorityDot[p]}`} />
                      {p}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${priorityDot[task.configuration.priority]}`} />
                  <span className="text-sm text-[#0E0D0C]/70 capitalize">{task.configuration.priority}</span>
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#0E0D0C] mb-2">
                Description
              </p>
              {isEditing ? (
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Add a description..."
                  rows={3}
                  className="w-full text-sm text-[#0E0D0C] placeholder:text-[#0E0D0C]/20 outline-none resize-none border border-black/[0.06] rounded-lg px-3 py-2.5 focus:border-black/20 transition-colors"
                />
              ) : (
                <p className="text-sm text-[#0E0D0C]/70 leading-relaxed">
                  {task.configuration.description || <span className="italic text-[#0E0D0C]/25">No description</span>}
                </p>
              )}
            </div>

            {/* Assigned To */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#0E0D0C] mb-2">
                Assigned To
              </p>
              {isEditing ? (
                <div className="flex flex-wrap gap-1.5 items-center min-h-[38px] px-3 py-2 border border-black/[0.06] rounded-lg focus-within:border-black/20 transition-colors">
                  {editAssignedTo.map((person) => (
                    <span key={person} className="flex items-center gap-1 text-xs px-2 py-0.5 bg-[#0E0D0C] text-white rounded-md">
                      {person}
                      <button
                        type="button"
                        onClick={() => setEditAssignedTo((prev) => prev.filter((a) => a !== person))}
                        className="text-white/50 hover:text-white leading-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={editAssigneeInput}
                    onChange={(e) => setEditAssigneeInput(e.target.value)}
                    onKeyDown={handleAssigneeKeyDown}
                    onBlur={addAssignee}
                    placeholder={editAssignedTo.length === 0 ? "Add assignees, press Enter…" : ""}
                    className="flex-1 min-w-24 text-sm text-[#0E0D0C] placeholder:text-[#0E0D0C]/20 outline-none bg-transparent"
                  />
                </div>
              ) : task.assignedTo.length === 0 ? (
                <p className="text-sm italic text-[#0E0D0C]/25">Unassigned</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {task.assignedTo.map((person) => (
                    <span key={person} className="flex items-center gap-1.5 text-xs px-2 py-1 bg-[#0E0D0C] text-white rounded-md">
                      <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[9px] font-bold">
                        {person[0]?.toUpperCase()}
                      </span>
                      {person}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Tags */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#0E0D0C] mb-2">
                Tags
              </p>
              {isEditing ? (
                <div className="flex flex-wrap gap-1.5 items-center min-h-[38px] px-3 py-2 border border-black/[0.06] rounded-lg focus-within:border-black/20 transition-colors">
                  {editTags.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 text-xs px-2 py-0.5 bg-black/5 text-[#0E0D0C]/60 rounded-md">
                      {tag}
                      <button
                        type="button"
                        onClick={() => setEditTags((prev) => prev.filter((t) => t !== tag))}
                        className="text-[#0E0D0C]/30 hover:text-[#0E0D0C]/70 leading-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={editTagInput}
                    onChange={(e) => setEditTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    onBlur={addTag}
                    placeholder={editTags.length === 0 ? "Add tags, press Enter…" : ""}
                    className="flex-1 min-w-24 text-sm text-[#0E0D0C] placeholder:text-[#0E0D0C]/20 outline-none bg-transparent"
                  />
                </div>
              ) : task.configuration.tags?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {task.configuration.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 bg-black/5 text-[#0E0D0C]/60 rounded-md">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm italic text-[#0E0D0C]/25">No tags</p>
              )}
            </div>

            {/* Dependencies — DAG in view mode, mini-card editor in edit mode */}
            {isEditing ? (
              otherTasks.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#0E0D0C] mb-2">
                    Dependencies
                  </p>
                  <div className="flex flex-col gap-2">
                    {editDependencyIds.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {editDependencyIds.map((depId) => {
                          const dep = allTasks.find((t) => t.id === depId)
                          if (!dep) return null
                          const sc = statusConfig[dep.status]
                          return (
                            <div key={depId} className="flex items-center gap-2.5 px-3 py-2.5 bg-white border border-black/[0.08] rounded-xl">
                              <span className={`w-1.5 h-1.5 rounded-full ${priorityDot[dep.configuration.priority]} shrink-0`} />
                              <span className="text-sm text-[#0E0D0C]/80 flex-1 truncate">{dep.title}</span>
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${sc.bg} ${sc.text} shrink-0`}>
                                {sc.label}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleDep(depId)}
                                className="text-[#0E0D0C]/25 hover:text-[#0E0D0C]/60 leading-none shrink-0 ml-1"
                              >
                                ×
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {otherTasks.filter((t) => !editDependencyIds.includes(t.id)).length > 0 && (
                      <div className="border border-dashed border-black/[0.1] rounded-xl overflow-hidden divide-y divide-black/[0.04]">
                        {otherTasks
                          .filter((t) => !editDependencyIds.includes(t.id))
                          .map((t) => {
                            const sc = statusConfig[t.status]
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => toggleDep(t.id)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-black/[0.02] transition-colors text-left"
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${priorityDot[t.configuration.priority]} shrink-0`} />
                                <span className="text-sm text-[#0E0D0C]/50 truncate flex-1">{t.title}</span>
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${sc.bg} ${sc.text} shrink-0`}>
                                  {sc.label}
                                </span>
                                <span className="text-[11px] text-[#0E0D0C]/25 shrink-0">+ Add</span>
                              </button>
                            )
                          })}
                      </div>
                    )}
                  </div>
                </div>
              )
            ) : (
              <TaskDag task={task} allTasks={allTasks} onOpenTask={onOpenTask} />
            )}
          </div>

          {/* Right — comments panel */}
          <div className="w-72 shrink-0 flex flex-col">
            {/* Comments header */}
            <div className="px-5 py-4 border-b border-black/[0.06] shrink-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#0E0D0C]">
                Comments{allComments.length > 0 && (
                  <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-black/5 text-[#0E0D0C]/50 normal-case tracking-normal">
                    {allComments.length}
                  </span>
                )}
              </p>
            </div>

            {/* Comments list */}
            <div className="flex-1 overflow-y-auto thin-scroll px-5 py-4 flex flex-col gap-4">
              {allComments.length === 0 ? (
                <p className="text-xs italic text-[#0E0D0C]/25">No comments yet</p>
              ) : (
                allComments.map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-[#0E0D0C] flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5">
                      {(c.author?.name ?? c.authorId)[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-xs font-semibold text-[#0E0D0C]/80">
                          {c.author?.name ?? c.authorId}
                        </span>
                        <span className="text-[10px] text-[#0E0D0C]/25 ml-auto shrink-0">
                          {new Date(c.createdAt).toLocaleDateString(undefined, {
                            month: "short", day: "numeric",
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-[#0E0D0C]/70 leading-relaxed break-words">{c.content}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={commentsEndRef} />
            </div>

            {/* Comment input */}
            <div className="px-5 py-3 border-t border-black/[0.06] shrink-0">
              <div className="flex flex-col gap-2">
                <textarea
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePostComment() }
                  }}
                  placeholder="Write a comment…"
                  rows={2}
                  className="w-full text-sm text-[#0E0D0C] placeholder:text-[#0E0D0C]/25 border border-black/[0.06] rounded-lg px-3 py-2 outline-none focus:border-black/20 transition-colors resize-none"
                />
                <button
                  type="button"
                  onClick={handlePostComment}
                  disabled={!commentInput.trim() || postingComment}
                  className="self-end px-3 py-1.5 text-xs font-medium text-white bg-[#0E0D0C] rounded-lg hover:bg-black/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {postingComment ? "Posting…" : "Post"}
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
