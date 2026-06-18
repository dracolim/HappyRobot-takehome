export type { TaskStatus, TaskPriority, TaskConfiguration, CreateTaskInput, UpdateTaskInput, CreateProjectInput, CreateCommentInput } from "@happyrobot/shared"
import type { TaskStatus, TaskConfiguration } from "@happyrobot/shared"

export interface Task {
  id: string
  projectId: string
  title: string
  status: TaskStatus
  assignedTo: string[]
  configuration: TaskConfiguration
  dependencies: string[]
  commentCount: number
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  name: string
  description: string
  metadata: Record<string, unknown>
  ownerId: string
  createdAt: string
  updatedAt: string
}

export interface Comment {
  id: string
  taskId: string
  content: string
  authorId: string
  author?: { id: string; name: string; email: string }
  createdAt: string
}

export interface User {
  id: string
  email: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface ProjectMember {
  userId: string
  name: string
  email: string
  role: "owner" | "member"
  joinedAt: string
}

export const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "in_review", label: "In Review" },
  { id: "done", label: "Completed" },
]
