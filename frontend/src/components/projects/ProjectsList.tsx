"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import type { Project } from "@/lib/types"

export function ProjectsList() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.projects
      .list()
      .then((res) => setProjects(res.projects))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[#0E0D0C]/30 text-sm">
        Loading...
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold text-[#0E0D0C]">Projects</h1>
        <button
          onClick={() => router.push("/projects/new")}
          className="flex items-center gap-2 px-4 py-2 bg-[#0E0D0C] text-white text-sm font-medium rounded-lg hover:bg-black/80 transition-colors"
        >
          <span className="text-base leading-none">+</span>
          New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <p className="text-[#0E0D0C]/50 text-sm mb-4">No projects yet. Create one to get started.</p>
          <button
            onClick={() => router.push("/projects/new")}
            className="px-4 py-2 bg-[#0E0D0C] text-white text-sm font-medium rounded-lg hover:bg-black/80 transition-colors"
          >
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => router.push(`/projects/${project.id}`)}
              className="text-left bg-white rounded-xl p-6 shadow-sm border border-black/[0.06] hover:shadow-md hover:border-black/10 transition-all group"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-[#0E0D0C] flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-sm">
                    {project.name[0]?.toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-[#0E0D0C] truncate">{project.name}</h2>
                  <p className="text-xs text-[#0E0D0C]/40 mt-0.5">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {project.description && (
                <p className="text-sm text-[#0E0D0C]/60 line-clamp-2">{project.description}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
