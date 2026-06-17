"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { Project } from "@/lib/types"

function HappyRobotLogo() {
  return (
    <svg width="24" height="19" viewBox="0 0 173 137" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M86 85.7496C86 76.134 80.7784 67.2768 72.365 62.6211L60.1565 55.8654C51.7432 51.2097 46.5216 42.3525 46.5216 32.7369V0H0V18.5271C0 28.3146 5.40812 37.301 14.0564 41.8838L25.4221 47.9067C34.0703 52.4896 39.4784 61.4759 39.4784 71.2634V137H86V85.7496Z" fill="white"/>
      <path d="M173 121.106C173 111.395 167.675 102.465 159.13 97.8492L146.43 90.9886C137.886 86.3728 132.561 77.4433 132.561 67.7318V0H86V52.921C86 62.6325 91.3253 71.5619 99.8697 76.1778L112.57 83.0384C121.114 87.6543 126.439 96.5838 126.439 106.295V137H173V121.106Z" fill="white"/>
    </svg>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    api.projects.list()
      .then((res) => setProjects(res.projects))
      .catch(() => {})
  }, [])

  const logout = () => {
    localStorage.removeItem("token")
    router.push("/login")
  }

  return (
    <aside className="w-60 h-full bg-[#0E0D0C] text-white flex flex-col shrink-0">
      <div className="px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <HappyRobotLogo />
          <span className="text-sm font-semibold tracking-tight">HappyRobot</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/30">
          Projects
        </p>

        {projects.length === 0 ? (
          <p className="px-3 text-xs text-white/20">No projects yet</p>
        ) : (
          <ul className="space-y-0.5">
            {projects.map((project) => {
              const isActive = pathname === `/projects/${project.id}`
              return (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                      isActive
                        ? "bg-white/15 text-white font-medium"
                        : "text-white/50 hover:bg-white/8 hover:text-white/80"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 shrink-0" />
                    <span className="truncate">{project.name}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 flex flex-col gap-2">
        <Link
          href="/projects/new"
          className="flex items-center gap-2 px-2 text-sm text-white/40 hover:text-white/70 transition-colors"
        >
          <span className="text-base leading-none">+</span>
          New Project
        </Link>
        <button
          onClick={logout}
          className="flex items-center gap-2 px-2 text-sm text-white/30 hover:text-white/60 transition-colors text-left"
        >
          <span className="text-base leading-none">↪</span>
          Sign out
        </button>
      </div>
    </aside>
  )
}
