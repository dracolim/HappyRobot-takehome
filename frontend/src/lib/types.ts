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
  attachmentCount: number
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

export interface Attachment {
  id: string
  taskId: string
  uploaderId: string
  filename: string
  size: number
  mimeType: string
  createdAt: string
}

export interface ProjectMember {
  userId: string
  name: string
  email: string
  role: "owner" | "member"
  joinedAt: string
}

export interface Notification {
  id: string
  type: "mention"
  projectId: string
  taskId: string | null
  commentId: string | null
  fromUserId: string | null
  fromUserName?: string | null
  body: string
  read: boolean
  createdAt: string
}

export interface ActivityEvent {
  id: string
  type: string
  actorId: string | null
  actorName: string
  taskId: string | null
  taskTitle: string | null
  description: string
  createdAt: string
  undoBefore: Record<string, unknown> | null
}

export const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "in_review", label: "In Review" },
  { id: "done", label: "Completed" },
]
