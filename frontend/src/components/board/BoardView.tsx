"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import type { Project } from "@/lib/types"
import { KanbanBoard } from "./KanbanBoard"

interface Props {
  paramsPromise: Promise<{ id: string }>
}

export function BoardView({ paramsPromise }: Props) {
  const { id } = use(paramsPromise)
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.projects
      .get(id)
      .then((res) => setProject(res.project))
      .catch(() => router.push("/projects"))
      .finally(() => setLoading(false))
  }, [id, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[#0E0D0C]/30 text-sm">
        Loading...
      </div>
    )
  }

  if (!project) return null

  return <KanbanBoard projectId={project.id} projectName={project.name} />
}
