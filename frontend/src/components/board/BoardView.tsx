"use client"

import { use, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/lib/api"
import type { Project } from "@/lib/types"
import { KanbanBoard } from "./KanbanBoard"

interface Props {
  paramsPromise: Promise<{ id: string }>
}

export function BoardView({ paramsPromise }: Props) {
  const { id } = use(paramsPromise)
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTaskId = searchParams.get("task") ?? undefined
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.projects
      .get(id)
      .then((res) => { if (!cancelled) setProject(res.project) })
      .catch((err: Error) => {
        if (cancelled) return
        const msg = err.message ?? ""
        if (msg.includes("Access denied") || msg.includes("403")) {
          setError("You don't have access to this project.")
        } else {
          setError("Failed to load project. Please try refreshing.")
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[#0E0D0C]/30 text-sm">
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-[#0E0D0C]/50">{error}</p>
        <button
          onClick={() => router.push("/projects")}
          className="px-4 py-2 text-sm font-medium bg-[#0E0D0C] text-white rounded-lg hover:bg-black/80 transition-colors"
        >
          Back to projects
        </button>
      </div>
    )
  }

  if (!project) return null

  return <KanbanBoard projectId={project.id} projectName={project.name} projectDescription={project.description} initialTaskId={initialTaskId} />
}
