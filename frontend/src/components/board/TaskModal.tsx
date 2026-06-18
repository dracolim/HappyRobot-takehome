"use client"

import { useEffect, useRef, useState } from "react"
import type { ProjectMember, Task, TaskStatus } from "@/lib/types"
import { MemberPicker } from "./MemberPicker"

interface TaskFormData {
  title: string
  priority: "low" | "medium" | "high" | "urgent"
  description: string
  tags: string[]
  assignedTo: string[]
  dependencyIds: string[]
  files: File[]
}

interface Props {
  status: TaskStatus
  existingTasks: Task[]
  members: ProjectMember[]
  onClose: () => void
  onSubmit: (data: TaskFormData) => void
}

const PRIORITIES = ["low", "medium", "high", "urgent"] as const

const priorityDot: Record<string, string> = {
  low: "bg-green-400",
  medium: "bg-yellow-400",
  high: "bg-orange-400",
  urgent: "bg-red-500",
}

const statusLabel: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Completed",
}

export function TaskModal({ status, existingTasks, members, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState("")
  const [priority, setPriority] = useState<TaskFormData["priority"]>("medium")
  const [description, setDescription] = useState("")
  const [tagInput, setTagInput] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [assignedTo, setAssignedTo] = useState<string[]>([])
  const [dependencyIds, setDependencyIds] = useState<string[]>([])
  const [showAllDeps, setShowAllDeps] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onEsc)
    return () => window.removeEventListener("keydown", onEsc)
  }, [onClose])

  const addTag = () => {
    const tag = tagInput.trim().replace(/,$/, "")
    if (tag && !tags.includes(tag)) setTags((prev) => [...prev, tag])
    setTagInput("")
  }

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag() }
    if (e.key === "Backspace" && !tagInput && tags.length > 0)
      setTags((prev) => prev.slice(0, -1))
  }

  const toggleDep = (id: string) => {
    setDependencyIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    )
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name))
      return [...prev, ...selected.filter((f) => !existing.has(f.name))]
    })
    e.target.value = ""
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onSubmit({ title: title.trim(), priority, description, tags, assignedTo, dependencyIds, files })
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl h-[700px] flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-black/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium px-2 py-1 rounded-md bg-black/5 text-[#0E0D0C]/50">
              {statusLabel[status]}
            </span>
            <button
              onClick={onClose}
              className="text-[#0E0D0C]/30 hover:text-[#0E0D0C]/70 transition-colors text-xl leading-none"
            >
              ×
            </button>
          </div>
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            className="w-full text-xl font-semibold text-[#0E0D0C] placeholder:text-[#0E0D0C]/20 outline-none"
          />
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 overflow-y-auto thin-scroll">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#0E0D0C]/30 mb-2">
              Priority
            </label>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${
                    priority === p
                      ? "border-[#0E0D0C] bg-[#0E0D0C] text-white"
                      : "border-black/10 text-[#0E0D0C]/50 hover:border-black/20"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${priorityDot[p]}`} />
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#0E0D0C]/30 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              rows={3}
              className="w-full text-sm text-[#0E0D0C] placeholder:text-[#0E0D0C]/20 outline-none resize-none border border-black/[0.06] rounded-lg px-3 py-2.5 focus:border-black/20 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#0E0D0C]/30 mb-2">
              Assigned To
            </label>
            <MemberPicker members={members} selected={assignedTo} onChange={setAssignedTo} />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#0E0D0C]/30 mb-2">
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5 items-center min-h-[38px] px-3 py-2 border border-black/[0.06] rounded-lg focus-within:border-black/20 transition-colors">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 bg-black/5 text-[#0E0D0C]/60 rounded-md"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                    className="text-[#0E0D0C]/30 hover:text-[#0E0D0C]/70 leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={addTag}
                placeholder={tags.length === 0 ? "Add tags, press Enter…" : ""}
                className="flex-1 min-w-24 text-sm text-[#0E0D0C] placeholder:text-[#0E0D0C]/20 outline-none bg-transparent"
              />
            </div>
          </div>

          {existingTasks.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#0E0D0C]/30 mb-2">
                Dependencies
              </label>
              <div className="border border-black/[0.06] rounded-lg overflow-hidden divide-y divide-black/[0.04]">
                {(showAllDeps ? existingTasks : existingTasks.slice(0, 5)).map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-black/[0.02] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={dependencyIds.includes(t.id)}
                      onChange={() => toggleDep(t.id)}
                      className="accent-[#0E0D0C] w-3.5 h-3.5 shrink-0"
                    />
                    <span className="text-sm text-[#0E0D0C]/70 truncate">{t.title}</span>
                    <span className="ml-auto text-[11px] text-[#0E0D0C]/30 capitalize shrink-0">
                      {t.status.replace("_", " ")}
                    </span>
                  </label>
                ))}
                {existingTasks.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllDeps((v) => !v)}
                    className="w-full px-3 py-2 text-left text-[11px] text-[#0E0D0C]/40 hover:text-[#0E0D0C]/60 hover:bg-black/[0.02] transition-colors"
                  >
                    {showAllDeps
                      ? "Show less"
                      : `Show ${existingTasks.length - 5} more…`}
                  </button>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#0E0D0C]/30 mb-2">
              Attachments
            </label>
            <div className="flex flex-col gap-1.5">
              {files.map((f) => (
                <div key={f.name} className="flex items-center gap-2 px-3 py-1.5 border border-black/[0.06] rounded-lg">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-[#0E0D0C]/30">
                    <path d="M7 1H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4L7 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                    <path d="M7 1v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-xs text-[#0E0D0C]/60 flex-1 truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((x) => x.name !== f.name))}
                    className="text-[#0E0D0C]/20 hover:text-red-400 transition-colors leading-none shrink-0"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-black/15 rounded-lg text-xs text-[#0E0D0C]/40 hover:text-[#0E0D0C]/60 hover:border-black/25 transition-colors"
              >
                <span>+ Attach files</span>
              </button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-[#0E0D0C] bg-black/5 rounded-lg hover:bg-black/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#0E0D0C] rounded-lg hover:bg-black/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
