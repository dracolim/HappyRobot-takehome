import type { RegisterInput, LoginInput, CreateProjectInput, CreateTaskInput, UpdateTaskInput, InviteMemberInput } from "@happyrobot/shared"
import type { Project, Task, Comment, ProjectMember, Attachment } from "./types"

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"

function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("token")
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (res.status === 401) {
    localStorage.removeItem("token")
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
      request<{ token: string; user: { id: string; email: string; name: string } }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    login: (body: LoginInput) =>
      request<{ token: string; user: { id: string; email: string; name: string } }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  projects: {
    list: () => request<{ projects: Project[] }>("/api/projects"),
    get: (id: string) => request<{ project: Project }>(`/api/projects/${id}`),
    create: (body: CreateProjectInput) =>
      request<{ project: Project }>("/api/projects", {
        method: "POST",
        body: JSON.stringify(body),
      }),
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
        `/api/projects/${projectId}/tasks${cursor ? `?cursor=${cursor}` : ""}`
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
      const token = getToken()
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`${BASE_URL}/api/tasks/${taskId}/attachments`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error ?? "Upload failed")
      }
      return res.json()
    },
    fetchBlobUrl: async (attachmentId: string): Promise<string> => {
      const token = getToken()
      const res = await fetch(`${BASE_URL}/api/attachments/${attachmentId}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
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
}
