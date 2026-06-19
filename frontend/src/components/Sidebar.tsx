"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { api } from "@/lib/api"
import type { Project, Notification } from "@/lib/types"
import { NotificationPanel } from "./NotificationPanel"
import { ConfirmModal } from "./ConfirmModal"

function HappyRobotLogo() {
  return (
    <svg width="24" height="19" viewBox="0 0 173 137" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M86 85.7496C86 76.134 80.7784 67.2768 72.365 62.6211L60.1565 55.8654C51.7432 51.2097 46.5216 42.3525 46.5216 32.7369V0H0V18.5271C0 28.3146 5.40812 37.301 14.0564 41.8838L25.4221 47.9067C34.0703 52.4896 39.4784 61.4759 39.4784 71.2634V137H86V85.7496Z" fill="white"/>
      <path d="M173 121.106C173 111.395 167.675 102.465 159.13 97.8492L146.43 90.9886C137.886 86.3728 132.561 77.4433 132.561 67.7318V0H86V52.921C86 62.6325 91.3253 71.5619 99.8697 76.1778L112.57 83.0384C121.114 87.6543 126.439 96.5838 126.439 106.295V137H173V121.106Z" fill="white"/>
    </svg>
  )
}

function getStoredUser(): { id: string; name: string; email: string } | null {
  try {
    const stored = typeof window !== "undefined" ? localStorage.getItem("currentUser") : null
    if (!stored) return null
    return JSON.parse(stored)
  } catch {
    return null
  }
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email: string } | null>(null)
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null)

  const unreadCount = notifs.filter(n => !n.read).length

  const loadNotifs = useCallback(() => {
    api.notifications.list()
      .then(res => setNotifs(res.notifications))
      .catch(() => {})
  }, [])

  const loadProjects = useCallback(() => {
    api.projects.list().then((res) => setProjects(res.projects)).catch(() => {})
  }, [])

  useEffect(() => {
    setCurrentUser(getStoredUser())
    loadProjects()
    loadNotifs()
  }, [loadProjects, loadNotifs])

  useEffect(() => {
    window.addEventListener("app:projectCreated", loadProjects)
    return () => window.removeEventListener("app:projectCreated", loadProjects)
  }, [loadProjects])

  // Listen for real-time notifications dispatched from KanbanBoard WS handler
  useEffect(() => {
    const handler = (e: Event) => {
      const notif = (e as CustomEvent<Notification>).detail
      setNotifs(prev => prev.some(n => n.id === notif.id) ? prev : [notif, ...prev])
    }
    window.addEventListener("app:notification", handler)
    return () => window.removeEventListener("app:notification", handler)
  }, [])

  const deleteProject = useCallback(async (project: Project) => {
    await api.projects.delete(project.id)
    setProjects(prev => prev.filter(p => p.id !== project.id))
    setPendingDelete(null)
    if (pathname === `/projects/${project.id}`) router.push("/projects")
  }, [pathname, router])

  const logout = () => {
    window.dispatchEvent(new CustomEvent("app:logout"))
    api.auth.logout().catch(() => {})
    localStorage.removeItem("currentUser")
    router.push("/login")
  }

  return (
    <aside className="w-60 h-full bg-[#0E0D0C] text-white flex flex-col shrink-0">
      <div className="px-5 py-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <Link href="/projects" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <HappyRobotLogo />
            <span className="text-sm font-semibold tracking-tight">HappyRobot</span>
          </Link>

          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifs(v => !v)}
              className="relative p-1 text-white/30 hover:text-white/70 transition-colors"
              title="Notifications"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5A4.5 4.5 0 0 0 3.5 6v2.5L2 10h12l-1.5-1.5V6A4.5 4.5 0 0 0 8 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                <path d="M6.5 10.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <NotificationPanel
                notifications={notifs}
                onClose={() => setShowNotifs(false)}
                onMarkRead={(id) => setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))}
                onMarkAllRead={() => setNotifs(prev => prev.map(n => ({ ...n, read: true })))}
              />
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex items-center justify-between px-3 mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/30">Projects</p>
          <Link
            href="/projects/new"
            className="text-white/30 hover:text-white/70 transition-colors text-lg leading-none"
            title="New project"
          >
            +
          </Link>
        </div>

        {projects.length === 0 ? (
          <p className="px-3 text-xs text-white/20">No projects yet</p>
        ) : (
          <ul className="space-y-0.5">
            {projects.map((project) => {
              const isActive = pathname === `/projects/${project.id}`
              const isOwner = project.ownerId === currentUser?.id
              return (
                <li key={project.id} className="group relative">
                  <Link
                    href={`/projects/${project.id}`}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                      isActive
                        ? "bg-white/15 text-white font-medium"
                        : "text-white/50 hover:bg-white/8 hover:text-white/80"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 shrink-0" />
                    <span>{project.name.length > 14 ? `${project.name.slice(0, 14)}…` : project.name}</span>
                  </Link>
                  {isOwner && (
                    <button
                      onClick={(e) => { e.preventDefault(); setPendingDelete(project) }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-1 rounded opacity-0 group-hover:opacity-100 text-white/60 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      title="Delete project"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M1.5 3h9M4.5 3V2h3v1M2.5 3l.5 7h6l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 flex flex-col gap-3">
        {currentUser && (
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <span className="text-xs font-semibold text-white">
                {currentUser.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white/80 truncate">{currentUser.name}</p>
              <p className="text-[10px] text-white/30 truncate">{currentUser.email}</p>
            </div>
          </div>
        )}

        <button
          onClick={logout}
          className="flex items-center gap-2 px-2 text-sm text-white/30 hover:text-white/60 transition-colors text-left"
        >
          <span className="text-base leading-none">↪</span>
          Sign out
        </button>
      </div>

      {pendingDelete && (
        <ConfirmModal
          title={`Delete "${pendingDelete.name}"?`}
          message="All tasks and comments in this project will be permanently deleted. This cannot be undone."
          confirmLabel="Delete project"
          onConfirm={() => deleteProject(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </aside>
  )
}
