"use client"

import { useLayoutEffect, useState } from "react"
import type { RefObject } from "react"
import type { CursorPeer } from "@/lib/useYjs"

const COLORS = ["#1155CC", "#15803D", "#9333EA", "#E11D48", "#0891B2", "#B45309", "#0F766E", "#C2410C"]

// Mirror-div technique: measures pixel position of a character offset inside a textarea
function caretCoords(el: HTMLTextAreaElement, pos: number): { top: number; left: number; height: number } {
  const s = getComputedStyle(el)
  const mirror = document.createElement("div")
  mirror.style.cssText =
    "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;word-wrap:break-word;"
  ;[
    "width", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "boxSizing", "fontFamily", "fontSize", "fontWeight", "fontStyle",
    "letterSpacing", "lineHeight",
  ].forEach((p) => { (mirror.style as unknown as Record<string, string>)[p] = (s as unknown as Record<string, string>)[p] })

  mirror.textContent = el.value.slice(0, Math.min(pos, el.value.length))
  const marker = document.createElement("span")
  marker.textContent = "​" // zero-width space — marks the cursor point
  mirror.appendChild(marker)
  document.body.appendChild(mirror)

  const top = marker.offsetTop + parseInt(s.borderTopWidth) - el.scrollTop
  const left = marker.offsetLeft + parseInt(s.borderLeftWidth)
  const height = parseFloat(s.lineHeight) || 20

  document.body.removeChild(mirror)
  return { top, left, height }
}

function SingleCursor({
  peer, name, color, textareaRef, value,
}: {
  peer: CursorPeer
  name: string
  color: string
  textareaRef: RefObject<HTMLTextAreaElement | null>
  value: string
}) {
  const [coords, setCoords] = useState<{ top: number; left: number; height: number } | null>(null)

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    setCoords(caretCoords(el, peer.position))
    const onScroll = () => setCoords(caretCoords(el, peer.position))
    el.addEventListener("scroll", onScroll)
    return () => el.removeEventListener("scroll", onScroll)
  }, [peer.position, value, textareaRef])

  if (!coords) return null

  return (
    <div className="pointer-events-none absolute" style={{ top: coords.top, left: coords.left, zIndex: 10 }}>
      {/* Floating name tag above the cursor line */}
      <div
        className="absolute bottom-full mb-0.5 whitespace-nowrap px-1.5 py-0.5 text-[10px] font-semibold text-white select-none"
        style={{ backgroundColor: color, borderRadius: "3px 3px 3px 0", left: 0 }}
      >
        {name}
      </div>
      {/* The cursor line itself */}
      <div className="w-0.5 rounded-sm" style={{ height: coords.height, backgroundColor: color }} />
    </div>
  )
}

interface Props {
  peers: CursorPeer[]
  members: { userId: string; name: string }[]
  textareaRef: RefObject<HTMLTextAreaElement | null>
  value: string
}

export function CollaborativeCursors({ peers, members, textareaRef, value }: Props) {
  if (peers.length === 0) return null
  // Sort by userId for a stable order so each user's color doesn't shift as
  // peers join/leave — first peer always gets COLORS[0], second COLORS[1], etc.
  const sorted = [...peers].sort((a, b) => a.userId.localeCompare(b.userId))
  return (
    <>
      {sorted.map((peer, i) => (
        <SingleCursor
          key={peer.userId}
          peer={peer}
          color={COLORS[i % COLORS.length]}
          name={members.find((m) => m.userId === peer.userId)?.name ?? peer.userId.slice(0, 6)}
          textareaRef={textareaRef}
          value={value}
        />
      ))}
    </>
  )
}
