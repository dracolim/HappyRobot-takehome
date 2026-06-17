import { Router, Request, Response } from "express"
import { db } from "../db"
import { tasks } from "../db/schema"
import { and, eq, lt, desc } from "drizzle-orm"
import { broadcast } from "../ws/manager"
import type { AuthRequest } from "../middleware/auth"

const VALID_TRANSITIONS: Record<string, string[]> = {
  todo: ["in_progress"],
  in_progress: ["in_review", "todo"],
  in_review: ["done", "in_progress"],
  done: ["in_review"],
}

const DEFAULT_CONFIG = {
  priority: "medium" as const,
  description: "",
  tags: [] as string[],
  customFields: {} as Record<string, unknown>,
}

const router = Router()

router.get("/:projectId/tasks", async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params
  const { cursor, limit = "20" } = req.query as Record<string, string>
  const pageSize = Math.min(parseInt(limit, 10), 100)

  const conditions = [eq(tasks.projectId, projectId)]
  if (cursor) conditions.push(lt(tasks.createdAt, new Date(cursor)))

  const rows = await db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(desc(tasks.createdAt))
    .limit(pageSize + 1)

  const hasMore = rows.length > pageSize
  const data = hasMore ? rows.slice(0, pageSize) : rows

  res.json({
    tasks: data,
    nextCursor: hasMore ? data[data.length - 1].createdAt.toISOString() : null,
  })
})

router.post("/:projectId/tasks", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req as AuthRequest
  const { projectId } = req.params
  const { title, status = "todo", assignedTo = [], configuration = {} } = req.body

  if (!title) { res.status(400).json({ error: "title required" }); return }

  const [task] = await db
    .insert(tasks)
    .values({
      projectId,
      title,
      status,
      assignedTo,
      configuration: { ...DEFAULT_CONFIG, ...configuration },
    })
    .returning()

  await broadcast(projectId, { type: "task.created", task }, userId)
  res.status(201).json({ task })
})

router.patch("/:projectId/tasks/:taskId", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req as AuthRequest
  const { projectId, taskId } = req.params

  const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId))
  if (!existing) { res.status(404).json({ error: "Not found" }); return }

  if (req.body.status && req.body.status !== existing.status) {
    const allowed = VALID_TRANSITIONS[existing.status] ?? []
    if (!allowed.includes(req.body.status)) {
      res.status(422).json({
        error: `Cannot transition from '${existing.status}' to '${req.body.status}'`,
      })
      return
    }
  }

  const [task] = await db
    .update(tasks)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning()

  await broadcast(projectId, { type: "task.updated", task }, userId)
  res.json({ task })
})

router.delete("/:projectId/tasks/:taskId", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req as AuthRequest
  const { projectId, taskId } = req.params
  await db.delete(tasks).where(eq(tasks.id, taskId))
  await broadcast(projectId, { type: "task.deleted", taskId }, userId)
  res.status(204).end()
})

export { router as tasksRouter }
