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
    register: (body: { email: string; password: string; name: string }) =>
      request<{ token: string; user: { id: string; email: string; name: string } }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    login: (body: { email: string; password: string }) =>
      request<{ token: string; user: { id: string; email: string; name: string } }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  projects: {
    list: () => request<{ projects: import("./types").Project[] }>("/api/projects"),
    get: (id: string) => request<{ project: import("./types").Project }>(`/api/projects/${id}`),
    create: (body: { name: string; description: string }) =>
      request<{ project: import("./types").Project }>("/api/projects", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  members: {
    list: (projectId: string) =>
      request<{ members: import("./types").ProjectMember[] }>(`/api/projects/${projectId}/members`),
    invite: (projectId: string, email: string) =>
      request<{ member: import("./types").ProjectMember }>(`/api/projects/${projectId}/members`, {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    remove: (projectId: string, userId: string) =>
      request<void>(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" }),
  },
  tasks: {
    list: (projectId: string, cursor?: string) =>
      request<{ tasks: import("./types").Task[]; nextCursor: string | null }>(
        `/api/projects/${projectId}/tasks${cursor ? `?cursor=${cursor}` : ""}`
      ),
    create: (projectId: string, body: Partial<import("./types").Task> & { dependencyIds?: string[] }) =>
      request<{ task: import("./types").Task }>(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (projectId: string, taskId: string, body: Partial<import("./types").Task> & { dependencyIds?: string[] }) =>
      request<{ task: import("./types").Task }>(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (projectId: string, taskId: string) =>
      request<void>(`/api/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" }),
  },
  comments: {
    list: (taskId: string) =>
      request<{ comments: import("./types").Comment[] }>(`/api/tasks/${taskId}/comments`),
    create: (taskId: string, content: string) =>
      request<{ comment: import("./types").Comment }>(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
  },
}
