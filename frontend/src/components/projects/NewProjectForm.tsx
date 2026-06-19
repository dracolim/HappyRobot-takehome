"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"

export function NewProjectForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setError("")
    try {
      const { project } = await api.projects.create({ name: name.trim(), description: description.trim() })
      window.dispatchEvent(new CustomEvent("app:projectCreated"))
      router.push(`/projects/${project.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="bg-white rounded-2xl shadow-sm border border-black/[0.06] p-8 w-full max-w-md">
        <h1 className="text-lg font-semibold text-[#0E0D0C] mb-6">New Project</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#0E0D0C]/70 mb-1.5">
              Project name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marketing Campaign"
              className="w-full px-3 py-2 text-sm border border-black/10 rounded-lg outline-none focus:border-black/30 focus:ring-2 focus:ring-black/5 transition"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#0E0D0C]/70 mb-1.5">
              Description <span className="text-[#0E0D0C]/30 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-black/10 rounded-lg outline-none focus:border-black/30 focus:ring-2 focus:ring-black/5 transition resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 px-4 py-2 text-sm font-medium text-[#0E0D0C] bg-black/5 rounded-lg hover:bg-black/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-[#0E0D0C] rounded-lg hover:bg-black/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
