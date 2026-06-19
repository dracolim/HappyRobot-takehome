import { Router, Request, Response } from "express"
import { db } from "../db"
import { events, users, tasks } from "../db/schema"
import { eq, desc } from "drizzle-orm"

const router = Router()

function fmt(val: unknown): string {
  if (val === null || val === undefined) return "none"
  if (typeof val === "string") return val.replace(/_/g, " ")
  if (Array.isArray(val)) return val.length === 0 ? "none" : (val as unknown[]).map(String).join(", ")
  return String(val)
}

function describeEvent(
  type: string,
  payload: { before?: Record<string, unknown>; after?: Record<string, unknown> }
): string {
  switch (type) {
    case "task.created": return "created"
    case "task.deleted": return "deleted"
    case "task.comment": return "commented on"
    case "task.updated": {
      const before = payload.before ?? {}
      const after = payload.after ?? {}

      if ("status" in after) {
        const from = fmt(before.status)
        const to = fmt(after.status)
        return `moved from ${from} → ${to} on`
      }
      if ("title" in after) {
        return `renamed "${fmt(before.title)}" → "${fmt(after.title)}" on`
      }
      if ("assignedTo" in after) {
        const prevIds = (before.assignedTo as string[] | null) ?? []
        const nextIds = (after.assignedTo as string[] | null) ?? []
        const added = nextIds.filter((id: string) => !prevIds.includes(id)).length
        const removed = prevIds.filter((id: string) => !nextIds.includes(id)).length
        if (added > 0 && removed > 0) return `added ${added} and removed ${removed} assignee(s) on`
        if (added > 0) return `added ${added} assignee(s) to`
        if (removed > 0) return `removed ${removed} assignee(s) from`
        return "updated assignees on"
      }
      if ("configuration" in after) {
        const bConf = (before.configuration ?? {}) as Record<string, unknown>
        const aConf = (after.configuration ?? {}) as Record<string, unknown>
        if ("priority" in aConf) {
          return `changed priority from ${fmt(bConf.priority)} → ${fmt(aConf.priority)} on`
        }
        if ("description" in aConf) return "updated description on"
        if ("tags" in aConf) return "updated tags on"
        return "updated"
      }
      return "updated"
    }
    default: return "acted on"
  }
}

router.get("/:projectId/activity", async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params
    const limit = Math.min(Number(req.query.limit ?? 30), 50)

    const rows = await db
      .select({
        id: events.id,
        type: events.type,
        payload: events.payload,
        createdAt: events.createdAt,
        actorId: users.id,
        actorName: users.name,
        taskId: tasks.id,
        taskTitle: tasks.title,
      })
      .from(events)
      .leftJoin(users, eq(users.id, events.userId))
      .leftJoin(tasks, eq(tasks.id, events.taskId))
      .where(eq(events.projectId, projectId))
      .orderBy(desc(events.createdAt))
      .limit(limit)

    const result = rows.map(r => {
      const p = r.payload as { before?: Record<string, unknown>; after?: Record<string, unknown> }
      return {
        id: r.id,
        type: r.type,
        actorId: r.actorId,
        actorName: r.actorName ?? "Unknown",
        taskId: r.taskId ?? null,
        taskTitle: r.taskTitle ?? (p.before?.title as string | undefined) ?? null,
        description: describeEvent(r.type, p),
        createdAt: r.createdAt,
        undoBefore: r.type === "task.updated" ? (p.before ?? null) : null,
      }
    })

    res.json({ events: result })
  } catch (err) {
    console.error("[GET activity]", err)
    res.status(500).json({ error: "Failed to fetch activity" })
  }
})

export { router as activityRouter }
