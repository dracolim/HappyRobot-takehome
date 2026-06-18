"use client"

import { useRef, useState } from "react"
import type { ProjectMember } from "@/lib/types"
import { useClickOutside } from "@/hooks/useClickOutside"

interface Props {
  members: ProjectMember[]
  selected: string[]
  onChange: (selected: string[]) => void
}

export function MemberPicker({ members, selected, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useClickOutside(containerRef, () => setOpen(false))

  const toggle = (name: string) => {
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name])
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex flex-wrap gap-1.5 items-center min-h-[38px] px-3 py-2 border border-black/[0.06] rounded-lg cursor-pointer hover:border-black/20 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {selected.map((name) => (
          <span
            key={name}
            className="flex items-center gap-1.5 text-xs px-2 py-0.5 bg-[#0E0D0C] text-white rounded-md"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[9px] font-bold shrink-0">
              {name[0]?.toUpperCase()}
            </span>
            {name}
            <button
              type="button"
              onClick={() => toggle(name)}
              className="text-white/40 hover:text-white leading-none ml-0.5"
            >
              ×
            </button>
          </span>
        ))}
        <span className="text-sm text-[#0E0D0C]/30 select-none">
          {selected.length === 0 ? "Select members…" : "+ Add"}
        </span>
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-black/[0.08] rounded-xl shadow-lg z-20 overflow-hidden max-h-52 overflow-y-auto">
          {members.length === 0 ? (
            <p className="px-3 py-3 text-xs text-[#0E0D0C]/30 italic">No members in project</p>
          ) : (
            members.map((m) => {
              const isSelected = selected.includes(m.name)
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => toggle(m.name)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-black/[0.02] transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-[#0E0D0C] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                    {m.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0E0D0C]/80 truncate">{m.name}</p>
                    <p className="text-[10px] text-[#0E0D0C]/40 truncate">{m.email}</p>
                  </div>
                  {isSelected && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-[#0E0D0C]">
                      <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
