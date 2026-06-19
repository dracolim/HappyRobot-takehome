import type { RegisterInput, LoginInput, CreateProjectInput, UpdateProjectInput, CreateTaskInput, UpdateTaskInput, InviteMemberInput } from "@happyrobot/shared"
import type { Project, Task, Comment, ProjectMember, Attachment, Notification, ActivityEvent } from "./types"

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  })

  if (res.status === 401) {
    localStorage.removeItem("currentUser")
    window.location.href = "/login"
    throw new Error("Unauthorized")
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? "Request failed")
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T
  }
  return res.json()
}

export const api = {
  auth: {
    register: (body: RegisterInput) =>
      request<{ user: { id: string; email: string; name: string } }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    login: (body: LoginInput) =>
      request<{ user: { id: string; email: string; name: string } }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  },
  projects: {
    list: () => request<{ projects: Project[] }>("/api/projects"),
    get: (id: string) => request<{ project: Project }>(`/api/projects/${id}`),
    create: (body: CreateProjectInput) =>
      request<{ project: Project }>("/api/projects", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: UpdateProjectInput) =>
      request<{ project: Project }>(`/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<void>(`/api/projects/${id}`, { method: "DELETE" }),
  },
  members: {
    list: (projectId: string) =>
      request<{ members: ProjectMember[] }>(`/api/projects/${projectId}/members`),
    invite: (projectId: string, body: InviteMemberInput) =>
      request<{ member: ProjectMember }>(`/api/projects/${projectId}/members`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    remove: (projectId: string, userId: string) =>
      request<void>(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" }),
  },
  tasks: {
    list: (projectId: string, cursor?: string) =>
      request<{ tasks: Task[]; nextCursor: string | null }>(
        `/api/projects/${projectId}/tasks?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
      ),
    create: (projectId: string, body: CreateTaskInput) =>
      request<{ task: Task }>(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (projectId: string, taskId: string, body: UpdateTaskInput) =>
      request<{ task: Task }>(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (projectId: string, taskId: string) =>
      request<void>(`/api/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" }),
  },
  comments: {
    list: (taskId: string) =>
      request<{ comments: Comment[] }>(`/api/tasks/${taskId}/comments`),
    create: (taskId: string, content: string) =>
      request<{ comment: Comment }>(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
  },
  attachments: {
    list: (taskId: string) =>
      request<{ attachments: Attachment[] }>(`/api/tasks/${taskId}/attachments`),
    upload: async (taskId: string, file: File): Promise<{ attachment: Attachment }> => {
      // Step 1: get a short-lived presigned PUT URL from the backend
      const { presignedUrl, objectKey } = await request<{ presignedUrl: string; objectKey: string }>(
        `/api/tasks/${taskId}/attachments/presign`,
        { method: "POST", body: JSON.stringify({ filename: file.name, mimeType: file.type }) },
      )

      // Step 2: upload directly to MinIO/R2 — backend is not in the data path
      const putRes = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      })
      if (!putRes.ok) throw new Error("Upload to storage failed")

      // Step 3: confirm with backend so it registers in DB and broadcasts WS event
      return request<{ attachment: Attachment }>(
        `/api/tasks/${taskId}/attachments/confirm`,
        { method: "POST", body: JSON.stringify({ objectKey, filename: file.name, size: file.size, mimeType: file.type }) },
      )
    },
    fetchBlobUrl: async (attachmentId: string): Promise<string> => {
      const res = await fetch(`${BASE_URL}/api/attachments/${attachmentId}/download`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to fetch")
      return URL.createObjectURL(await res.blob())
    },
    download: async (attachmentId: string, filename: string): Promise<void> => {
      const url = await api.attachments.fetchBlobUrl(attachmentId)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    },
    delete: (attachmentId: string) =>
      request<void>(`/api/attachments/${attachmentId}`, { method: "DELETE" }),
  },
  notifications: {
    list: () => request<{ notifications: Notification[]; unreadCount: number }>("/api/notifications"),
    markRead: (id: string) => request<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: "PATCH" }),
    markAllRead: () => request<{ ok: boolean }>("/api/notifications/read-all", { method: "PATCH" }),
  },
  activity: {
    list: (projectId: string) =>
      request<{ events: ActivityEvent[] }>(`/api/projects/${projectId}/activity`),
  },
}
