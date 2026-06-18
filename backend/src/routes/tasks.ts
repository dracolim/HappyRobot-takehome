import { Router, Request, Response, NextFunction } from "express"
import { db } from "../db"
import { tasks, taskDependencies, comments, projectMembers } from "../db/schema"
import { and, eq, lt, desc, inArray, count } from "drizzle-orm"
import { broadcast } from "../ws/manager"
import type { AuthRequest } from "../middleware/auth"
import { CreateTaskSchema, UpdateTaskSchema } from "@happyrobot/shared"

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

router.param("projectId", async (req: Request, res: Response, next: NextFunction, projectId: string) => {
  const { userId } = req as AuthRequest
  const [member] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))

  if (!member) { res.status(403).json({ error: "Access denied" }); return }
  next()
})

async function attachDependencies(rows: typeof tasks.$inferSelect[]) {
  if (rows.length === 0) return rows.map((t) => ({ ...t, dependencies: [] as string[] }))

  const taskIds = rows.map((t) => t.id)
  const deps = await db
    .select()
    .from(taskDependencies)
    .where(inArray(taskDependencies.taskId, taskIds))

  return rows.map((task) => ({
    ...task,
    dependencies: deps
      .filter((d) => d.taskId === task.id)
      .map((d) => d.dependsOnId),
  }))
}

async function attachCommentCounts<T extends { id: string }>(rows: T[]) {
  if (rows.length === 0) return rows.map((t) => ({ ...t, commentCount: 0 }))

  const taskIds = rows.map((t) => t.id)
  const counts = await db
    .select({ taskId: comments.taskId, n: count() })
    .from(comments)
    .where(inArray(comments.taskId, taskIds))
    .groupBy(comments.taskId)

  const countMap = Object.fromEntries(counts.map((c) => [c.taskId, Number(c.n)]))
  return rows.map((t) => ({ ...t, commentCount: countMap[t.id] ?? 0 }))
}

router.get("/:projectId/tasks", async (req: Request, res: Response): Promise<void> => {
  try {
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
    const withDeps = await attachDependencies(hasMore ? rows.slice(0, pageSize) : rows)
    const data = await attachCommentCounts(withDeps)

    res.json({
      tasks: data,
      nextCursor: hasMore ? data[data.length - 1].createdAt.toISOString() : null,
    })
  } catch (err) {
    console.error("[GET tasks]", err)
    res.status(500).json({ error: "Failed to fetch tasks" })
  }
})

router.post("/:projectId/tasks", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req as AuthRequest
    const { projectId } = req.params

    const parsed = CreateTaskSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return }

    const { title, status, assignedTo, configuration, dependencyIds: depIds } = parsed.data

    const task = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(tasks)
        .values({
          projectId,
          title,
          status: status ?? "todo",
          assignedTo,
          configuration: { ...DEFAULT_CONFIG, ...configuration },
        })
        .returning()

      if (depIds.length > 0) {
        await tx.insert(taskDependencies).values(
          depIds.map((depId) => ({ taskId: created.id, dependsOnId: depId }))
        )
      }

      return created
    })

    const result = { ...task, dependencies: depIds, commentCount: 0 }
    broadcast(projectId, { type: "task.created", task: result }, userId).catch(() => {})
    res.status(201).json({ task: result })
  } catch (err) {
    console.error("[POST task]", err)
    res.status(500).json({ error: "Failed to create task" })
  }
})

router.patch("/:projectId/tasks/:taskId", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req as AuthRequest
    const { projectId, taskId } = req.params

    const parsed = UpdateTaskSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return }

    const { dependencyIds, configuration: configUpdate, ...fields } = parsed.data

    const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId))
    if (!existing) { res.status(404).json({ error: "Not found" }); return }

    if (fields.status && fields.status !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status] ?? []
      if (!allowed.includes(fields.status)) {
        res.status(422).json({
          error: `Cannot transition from '${existing.status}' to '${fields.status}'`,
        })
        return
      }

      if (fields.status === "done") {
        const deps = await db
          .select()
          .from(taskDependencies)
          .where(eq(taskDependencies.taskId, taskId))

        if (deps.length > 0) {
          const depTasks = await db
            .select()
            .from(tasks)
            .where(inArray(tasks.id, deps.map((d) => d.dependsOnId)))

          const incomplete = depTasks.filter((t) => t.status !== "done")
          if (incomplete.length > 0) {
            res.status(422).json({
              error: "Cannot complete task: dependencies not yet done",
              blocking: incomplete.map((t) => ({ id: t.id, title: t.title, status: t.status })),
            })
            return
          }
        }
      }
    }

    const mergedConfig = configUpdate !== undefined
      ? { ...existing.configuration, ...configUpdate } as typeof existing.configuration
      : undefined

    const updatedTask = await db.transaction(async (tx) => {
      const [task] = await tx
        .update(tasks)
        .set({ ...fields, ...(mergedConfig !== undefined ? { configuration: mergedConfig } : {}), updatedAt: new Date() })
        .where(eq(tasks.id, taskId))
        .returning()

      if (dependencyIds !== undefined) {
        const depIds: string[] = Array.isArray(dependencyIds) ? dependencyIds : []
        await tx.delete(taskDependencies).where(eq(taskDependencies.taskId, taskId))
        if (depIds.length > 0) {
          await tx.insert(taskDependencies).values(
            depIds.map((depId: string) => ({ taskId, dependsOnId: depId }))
          )
        }
      }

      return task
    })

    const [withDeps] = await attachDependencies([updatedTask])
    const [withAll] = await attachCommentCounts([withDeps])
    broadcast(projectId, { type: "task.updated", task: withAll }, userId).catch(() => {})
    res.json({ task: withAll })
  } catch (err) {
    console.error("[PATCH task]", err)
    res.status(500).json({ error: "Failed to update task" })
  }
})

router.delete("/:projectId/tasks/:taskId", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req as AuthRequest
    const { projectId, taskId } = req.params
    await db.delete(tasks).where(eq(tasks.id, taskId))
    broadcast(projectId, { type: "task.deleted", taskId }, userId).catch(() => {})
    res.status(204).end()
  } catch (err) {
    console.error("[DELETE task]", err)
    res.status(500).json({ error: "Failed to delete task" })
  }
})

export { router as tasksRouter }
