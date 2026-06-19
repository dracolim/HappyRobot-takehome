let lastActivity = Date.now()
let scheduled = false

const record = () => {
  if (scheduled) return
  scheduled = true
  setTimeout(() => {
    lastActivity = Date.now()
    scheduled = false
  }, 1_000)
}

if (typeof window !== "undefined") {
  ;["mousemove", "keydown", "click", "scroll"].forEach(e =>
    window.addEventListener(e, record, { passive: true })
  )
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") lastActivity = Date.now()
  })
}

export const isActive = (thresholdMs = 5 * 60 * 1000): boolean =>
  Date.now() - lastActivity < thresholdMs
