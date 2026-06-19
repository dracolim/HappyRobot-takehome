/* eslint-disable @next/next/no-img-element */
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { api } from "@/lib/api"
import type { Attachment, Comment, ProjectMember, Task, TaskPriority, TaskStatus } from "@/lib/types"
import { MemberPicker } from "./MemberPicker"
import { VALID_TRANSITIONS } from "@happyrobot/shared"
import { TaskDag } from "./TaskDag"
import { useBlobUrl } from "@/hooks/useBlobUrl"
import { useYjs } from "@/lib/useYjs"
import { CollaborativeCursors } from "./CollaborativeCursors"
import type { PresenceUser, SocketEvent } from "@/lib/useProjectSocket"

function fileExtension(filename: string) {
  return filename.split(".").pop()?.toUpperCase() ?? "FILE"
}

const extColors: Record<string, string> = {
  PDF: "bg-red-50 text-red-500",
  DOC: "bg-blue-50 text-blue-500",
  DOCX: "bg-blue-50 text-blue-500",
  XLS: "bg-green-50 text-green-600",
  XLSX: "bg-green-50 text-green-600",
  ZIP: "bg-yellow-50 text-yellow-600",
  RAR: "bg-yellow-50 text-yellow-600",
}

function PreviewModal({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const { blobUrl, loading } = useBlobUrl(attachment.id)
  const isImage = attachment.mimeType.startsWith("image/")
  const isPdf = attachment.mimeType === "application/pdf"
  const canPreview = isImage || isPdf

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative w-full max-w-4xl mx-6 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-white text-sm font-medium truncate max-w-sm">{attachment.filename}</p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => api.attachments.download(attachment.id, attachment.filename)}
              className="text-[11px] font-medium text-white/60 hover:text-white px-3 py-1.5 rounded-lg border border-white/20 hover:border-white/40 transition-colors"
            >
              Download
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-white/50 hover:text-white text-xl leading-none transition-colors"
            >
              ×
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl overflow-hidden flex items-center justify-center max-h-[80vh]">
          {loading ? (
            <div className="w-full h-64 flex items-center justify-center">
              <span className="text-[#0E0D0C]/30 text-sm">Loading…</span>
            </div>
          ) : blobUrl && isImage ? (
            <img src={blobUrl} alt={attachment.filename} className="max-w-full max-h-[80vh] object-contain" />
          ) : blobUrl && isPdf ? (
            <iframe src={blobUrl} title={attachment.filename} className="w-full h-[80vh]" />
          ) : (
            <div className="p-12 flex flex-col items-center gap-4">
              <span className={`text-lg font-bold px-4 py-2 rounded-xl ${extColors[fileExtension(attachment.filename)] ?? "bg-black/[0.04] text-[#0E0D0C]/40"}`}>
                {fileExtension(attachment.filename)}
              </span>
              <p className="text-sm text-[#0E0D0C]/40">
                {canPreview ? "Failed to load preview" : "Preview not available for this file type"}
              </p>
              <button
                type="button"
                onClick={() => api.attachments.download(attachment.id, attachment.filename)}
                className="px-4 py-2 bg-[#0E0D0C] text-white rounded-lg text-sm hover:bg-black/80 transition-colors"
              >
                Download
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-white/30 text-[11px]">{formatBytes(attachment.size)}</p>
      </div>
    </div>
  )
}

function AttachmentCard({ attachment, isEditing, onPreview, onDelete }: {
  attachment: Attachment
  isEditing: boolean
  onPreview: (attachment: Attachment) => void
  onDelete: (id: string) => void
}) {
  const isImage = attachment.mimeType.startsWith("image/")
  const { blobUrl } = useBlobUrl(isImage ? attachment.id : null)

  const ext = fileExtension(attachment.filename)
  const extColor = extColors[ext] ?? "bg-black/[0.04] text-[#0E0D0C]/40"

  return (
    <div className="relative group rounded-xl border border-black/[0.06] overflow-hidden hover:border-black/10 transition-colors">
      <button
        type="button"
        onClick={() => onPreview(attachment)}
        className="w-full text-left cursor-pointer"
      >
        <div className="h-16 flex items-center justify-center bg-black/[0.02]">
          {isImage ? (
            blobUrl ? (
              <img src={blobUrl} alt={attachment.filename} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-black/[0.04] animate-pulse" />
            )
          ) : (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${extColor}`}>{ext}</span>
          )}
        </div>
        <div className="px-2.5 py-2 border-t border-black/[0.05]">
          <p className="text-[11px] font-medium text-[#0E0D0C]/70 truncate">{attachment.filename}</p>
          <p className="text-[10px] text-[#0E0D0C]/30">{formatBytes(attachment.size)}</p>
        </div>
      </button>
      {isEditing && (
        <button
          type="button"
          onClick={() => onDelete(attachment.id)}
          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/50 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity leading-none hover:bg-red-500"
        >
          ×
        </button>
      )}
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export interface UpdatePayload {
  title?: string
  status?: TaskStatus
  assignedTo?: string[]
  dependencyIds?: string[]
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
  sendRaw: (msg: object) => void
  onRegisterYjsHandler: (handler: ((e: SocketEvent) => void) | null) => void
  viewers: PresenceUser[]
  realtimeComments: Comment[]
  onCommentPosted: (taskId: string) => void
  realtimeAttachments: Attachment[]
  realtimeDeletedAttachmentIds: string[]
  members: ProjectMember[]
  onAttachmentUploaded: (taskId: string) => void
  onAttachmentDeleted: (taskId: string) => void
}


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

const PRIORITIES = ["low", "medium", "high", "urgent"] as const

export function TaskDetailModal({ task, allTasks, onClose, onSave, onDelete, onOpenTask, onJoinTask, onLeaveTask, onHeartbeat, sendRaw, onRegisterYjsHandler, viewers, realtimeComments, onCommentPosted, realtimeAttachments, realtimeDeletedAttachmentIds, members, onAttachmentUploaded, onAttachmentDeleted }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editTagInput, setEditTagInput] = useState("")
  const [showAllDeps, setShowAllDeps] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  type FormValues = {
    title: string
    priority: TaskPriority
    tags: string[]
    assignedTo: string[]
    dependencyIds: string[]
    status: TaskStatus
  }

  const form = useForm<FormValues>({
    defaultValues: {
      title: task.title,
      priority: task.configuration.priority,
      tags: task.configuration.tags ?? [],
      assignedTo: task.assignedTo ?? [],
      dependencyIds: task.dependencies ?? [],
      status: task.status,
    },
  })
  const { register, handleSubmit, watch, setValue, reset } = form
  const watchedStatus = watch("status")
  const watchedPriority = watch("priority")
  const watchedTags = watch("tags")
  const watchedAssignedTo = watch("assignedTo")
  const watchedDependencyIds = watch("dependencyIds")
  const [commentsList, setCommentsList] = useState<Comment[]>([])
  const [commentInput, setCommentInput] = useState("")
  const [postingComment, setPostingComment] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const commentsEndRef = useRef<HTMLDivElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)

  const currentUserId = typeof window !== "undefined"
    ? (() => { try { return (JSON.parse(localStorage.getItem("currentUser") ?? "null") as { id?: string } | null)?.id ?? "" } catch { return "" } })()
    : ""

  const { content: yjsDescription, onChange: onYjsDescriptionChange, onCursorMove, cursorPeers, revertContent } = useYjs({
    taskId: task.id,
    initialContent: task.configuration.description ?? "",
    userId: currentUserId,
    enabled: isEditing,
    sendRaw,
    onRegisterYjsHandler,
    textareaRef: descriptionRef,
  })

  // Sync form when task prop changes (e.g. another user saved)
  useEffect(() => {
    reset({
      title: task.title,
      priority: task.configuration.priority,
      tags: task.configuration.tags ?? [],
      assignedTo: task.assignedTo ?? [],
      dependencyIds: task.dependencies ?? [],
      status: task.status,
    })
  }, [task]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const allAttachments = useMemo(() => {
    const ids = new Set(attachments.map((a) => a.id))
    const merged = [...attachments, ...realtimeAttachments.filter((a) => !ids.has(a.id))]
    return merged.filter((a) => !realtimeDeletedAttachmentIds.includes(a.id))
  }, [attachments, realtimeAttachments, realtimeDeletedAttachmentIds])

  useEffect(() => {
    api.comments.list(task.id).then((res) => setCommentsList(res.comments)).catch(() => {})
    api.attachments.list(task.id).then((res) => setAttachments(res.attachments)).catch(() => {})
  }, [task.id])

  // presence: join on open, leave on close, heartbeat every 15s
  useEffect(() => {
    onJoinTask(task.id)
    return () => onLeaveTask(task.id)
  }, [task.id, onJoinTask, onLeaveTask])

  // broadcast edit mode to other viewers
  useEffect(() => {
    sendRaw({ type: "presence.mode", taskId: task.id, mode: isEditing ? "editing" : "viewing" })
  }, [isEditing, task.id, sendRaw])

  // re-announce presence on WS reconnect — the server's in-memory client is fresh
  // after a reconnect and has no record of which task we're in or our edit mode
  const isEditingRef = useRef(isEditing)
  useEffect(() => { isEditingRef.current = isEditing }, [isEditing])
  useEffect(() => {
    const resync = () => {
      onJoinTask(task.id)
      sendRaw({ type: "presence.mode", taskId: task.id, mode: isEditingRef.current ? "editing" : "viewing" })
    }
    window.addEventListener("ws:reconnected", resync)
    return () => window.removeEventListener("ws:reconnected", resync)
  }, [task.id, onJoinTask, sendRaw])

  useEffect(() => {
    const id = setInterval(() => onHeartbeat(task.id), 15_000)
    return () => clearInterval(id)
  }, [task.id, onHeartbeat])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (previewAttachment) setPreviewAttachment(null)
      else onClose()
    }
    window.addEventListener("keydown", onEsc)
    return () => window.removeEventListener("keydown", onEsc)
  }, [onClose, previewAttachment])

  const cancelEdit = () => {
    // Revert Yjs doc to last-saved description BEFORE clearing isEditing,
    // so the revert delta is still broadcast to collaborators.
    revertContent(task.configuration.description ?? "")
    reset()
    setEditTagInput("")
    setIsEditing(false)
  }

  const addTag = () => {
    const tag = editTagInput.trim().replace(/,$/, "")
    if (tag && !watchedTags.includes(tag)) setValue("tags", [...watchedTags, tag])
    setEditTagInput("")
  }

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag() }
    if (e.key === "Backspace" && !editTagInput && watchedTags.length > 0)
      setValue("tags", watchedTags.slice(0, -1))
  }

  const toggleDep = (id: string) => {
    setValue("dependencyIds", watchedDependencyIds.includes(id)
      ? watchedDependencyIds.filter((d) => d !== id)
      : [...watchedDependencyIds, id]
    )
  }

  const stageStatus = (newStatus: TaskStatus) => {
    setValue("status", newStatus)
    setIsEditing(true)
    setSaveError(null)
  }

  const onSubmit = async (data: FormValues) => {
    const updates: UpdatePayload = {}

    if (data.status !== task.status) updates.status = data.status
    if (data.title !== task.title) updates.title = data.title
    if (JSON.stringify(data.assignedTo) !== JSON.stringify(task.assignedTo ?? [])) updates.assignedTo = data.assignedTo
    if (JSON.stringify(data.dependencyIds) !== JSON.stringify(task.dependencies ?? [])) updates.dependencyIds = data.dependencyIds

    const config: UpdatePayload["configuration"] = {}
    if (data.priority !== task.configuration.priority) config.priority = data.priority
    if (yjsDescription !== (task.configuration.description ?? "")) config.description = yjsDescription
    if (JSON.stringify(data.tags) !== JSON.stringify(task.configuration.tags ?? [])) config.tags = data.tags
    if (Object.keys(config).length > 0) updates.configuration = config

    if (Object.keys(updates).length === 0) { setIsEditing(false); return }

    setSaveError(null)
    setSaving(true)
    try {
      await onSave(task.id, updates)
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
      onCommentPosted(task.id)
      window.dispatchEvent(new CustomEvent("app:activityRefresh"))
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
    } finally {
      setPostingComment(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setUploading(true)
    try {
      const res = await api.attachments.upload(task.id, file)
      setAttachments((prev) => [...prev, res.attachment])
      onAttachmentUploaded(task.id)
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteAttachment = async (attachmentId: string) => {
    await api.attachments.delete(attachmentId)
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
    onAttachmentDeleted(task.id)
  }



  return (
    <>
    {previewAttachment && (
      <PreviewModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
    )}
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl h-[85vh] flex flex-col">

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
                    onClick={handleSubmit(onSubmit)}
                    disabled={saving || !watch("title")?.trim()}
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
              {...register("title")}
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
                <div key={v.userId} title={`${v.name} · ${v.mode === "editing" ? "editing" : "viewing"}`} className="w-5 h-5 rounded-full bg-blue-500 border-2 border-blue-50 flex items-center justify-center text-[8px] font-bold text-white">
                  {v.name[0]?.toUpperCase()}
                </div>
              ))}
            </div>
            <span className="text-xs text-blue-600">
              {viewers.length === 1
                ? `${viewers[0].name} is ${viewers[0].mode === "editing" ? "editing" : "viewing"}`
                : (() => {
                    const editors = viewers.filter(v => v.mode === "editing")
                    const viewersOnly = viewers.filter(v => v.mode !== "editing")
                    if (editors.length > 0 && viewersOnly.length === 0) return `${editors.length === 1 ? editors[0].name : `${editors.length} others`} ${editors.length === 1 ? "is" : "are"} editing`
                    if (editors.length === 0) return `${viewers.length} others are viewing`
                    return `${editors.length} editing, ${viewersOnly.length} viewing`
                  })()
              }
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
                    const isStaged = watchedStatus === s && s !== task.status
                    return (
                      <button
                        key={s}
                        onClick={() => !isBlocked && stageStatus(s)}
                        disabled={isBlocked}
                        title={isBlocked ? `Blocked by: ${blockingTasks.map((t) => t.title).join(", ")}` : undefined}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                          isStaged
                            ? "border-[#0E0D0C] bg-[#0E0D0C] text-white"
                            : `${sc.bg} ${sc.text} border-current/20 hover:opacity-80`
                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        {isStaged ? `→ ${sc.label}` : sc.label}
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
                      onClick={() => setValue("priority", p)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${
                        watchedPriority === p
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
                <div className="relative">
                  <textarea
                    ref={descriptionRef}
                    value={yjsDescription}
                    onChange={(e) => onYjsDescriptionChange(e.target.value)}
                    onSelect={(e) => onCursorMove((e.target as HTMLTextAreaElement).selectionStart)}
                    onClick={(e) => onCursorMove((e.target as HTMLTextAreaElement).selectionStart)}
                    onKeyUp={(e) => onCursorMove((e.target as HTMLTextAreaElement).selectionStart)}
                    placeholder="Add a description..."
                    rows={6}
                    className="w-full text-sm text-[#0E0D0C] placeholder:text-[#0E0D0C]/20 outline-none resize-none border border-black/[0.06] rounded-lg px-3 py-2.5 focus:border-black/20 transition-colors"
                  />
                  <CollaborativeCursors
                    peers={cursorPeers}
                    members={members}
                    textareaRef={descriptionRef}
                    value={yjsDescription}
                  />
                </div>
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
                <MemberPicker members={members} selected={watchedAssignedTo} onChange={(v) => setValue("assignedTo", v)} />
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
                  {watchedTags.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 text-xs px-2 py-0.5 bg-black/5 text-[#0E0D0C]/60 rounded-md">
                      {tag}
                      <button
                        type="button"
                        onClick={() => setValue("tags", watchedTags.filter((t) => t !== tag))}
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
                    placeholder={watchedTags.length === 0 ? "Add tags, press Enter…" : ""}
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
                    {watchedDependencyIds.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {watchedDependencyIds.map((depId) => {
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
                    {(() => {
                      const available = otherTasks.filter((t) => !watchedDependencyIds.includes(t.id))
                      const visible = showAllDeps ? available : available.slice(0, 5)
                      const hiddenCount = available.length - 5
                      if (available.length === 0) return null
                      return (
                        <div className="border border-dashed border-black/[0.1] rounded-xl overflow-hidden divide-y divide-black/[0.04]">
                          {visible.map((t) => {
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
                          {hiddenCount > 0 && (
                            <button
                              type="button"
                              onClick={() => setShowAllDeps(true)}
                              className="w-full px-3 py-2 text-[11px] text-[#0E0D0C]/35 hover:text-[#0E0D0C]/60 hover:bg-black/[0.02] transition-colors text-left"
                            >
                              Show {hiddenCount} more…
                            </button>
                          )}
                          {showAllDeps && available.length > 5 && (
                            <button
                              type="button"
                              onClick={() => setShowAllDeps(false)}
                              className="w-full px-3 py-2 text-[11px] text-[#0E0D0C]/35 hover:text-[#0E0D0C]/60 hover:bg-black/[0.02] transition-colors text-left"
                            >
                              Show less
                            </button>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )
            ) : (
              <TaskDag task={task} allTasks={allTasks} onOpenTask={onOpenTask} />
            )}

            {/* Attachments */}
            {(allAttachments.length > 0 || isEditing) && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#0E0D0C]">
                    Attachments{allAttachments.length > 0 && (
                      <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-black/5 text-[#0E0D0C]/50 normal-case tracking-normal">
                        {allAttachments.length}
                      </span>
                    )}
                  </p>
                  {isEditing && (
                    <>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="text-[10px] font-medium text-[#0E0D0C]/40 hover:text-[#0E0D0C]/70 disabled:opacity-40 transition-colors"
                      >
                        {uploading ? "Uploading…" : "+ Upload"}
                      </button>
                      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
                    </>
                  )}
                </div>
                {allAttachments.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-black/[0.08] rounded-xl py-4 text-xs text-[#0E0D0C]/30 hover:border-black/20 hover:text-[#0E0D0C]/50 transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                    Attach a file
                  </button>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {allAttachments.map((a) => (
                      <AttachmentCard
                        key={a.id}
                        attachment={a}
                        isEditing={isEditing}
                        onPreview={setPreviewAttachment}
                        onDelete={handleDeleteAttachment}
                      />
                    ))}
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-full min-h-[80px] flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-black/[0.08] rounded-xl text-[10px] text-[#0E0D0C]/30 hover:border-black/20 hover:text-[#0E0D0C]/50 transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                        </svg>
                        Add file
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right — comments + files panel */}
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
                      <p className="text-sm text-[#0E0D0C]/70 leading-relaxed break-words">
                        {c.content.split(/(@\w+)/).map((part, i) =>
                          /^@\w+$/.test(part)
                            ? <span key={i} className="text-blue-600 font-medium">{part}</span>
                            : part
                        )}
                      </p>
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
    </>
  )
}
