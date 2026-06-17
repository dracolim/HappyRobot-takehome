"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { COLUMNS } from "@/lib/types"
import type { Task, TaskStatus } from "@/lib/types"
import { KanbanColumn } from "./KanbanColumn"

interface Props {
  projectId: string
  projectName: string
}

export function KanbanBoard({ projectId, projectName }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.tasks
      .list(projectId)
      .then((res) => setTasks(res.tasks))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  const tasksByStatus = (status: TaskStatus) =>
    tasks.filter((t) => t.status === status)

  const handleAddTask = (status: TaskStatus) => {
    const title = window.prompt("Task title:")
    if (!title?.trim()) return

    const optimistic: Task = {
      id: `temp-${Date.now()}`,
      projectId,
      title: title.trim(),
      status,
      assignedTo: [],
      configuration: { priority: "medium", description: "", tags: [], customFields: {} },
      dependencies: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setTasks((prev) => [...prev, optimistic])

    api.tasks
      .create(projectId, { title: optimistic.title, status })
      .then((res) =>
        setTasks((prev) => prev.map((t) => (t.id === optimistic.id ? res.task : t)))
      )
      .catch(() =>
        setTasks((prev) => prev.filter((t) => t.id !== optimistic.id))
      )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[#0E0D0C]/30 text-sm">
        Loading...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-5 bg-white border-b border-black/[0.06]">
        <h1 className="text-base font-semibold text-[#0E0D0C]">{projectName}</h1>
      </div>

      <div className="flex gap-5 p-8 overflow-x-auto flex-1">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            label={col.label}
            status={col.id}
            tasks={tasksByStatus(col.id)}
            onAddTask={() => handleAddTask(col.id)}
          />
        ))}
      </div>
    </div>
  )
}
