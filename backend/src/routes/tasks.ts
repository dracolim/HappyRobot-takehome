import { Router, Request, Response, NextFunction } from "express"
import { db } from "../db"
import { tasks, taskDependencies, comments, attachments, projectMembers, events } from "../db/schema"
import { and, eq, lt, desc, inArray, count, sql } from "drizzle-orm"
import { broadcast } from "../ws/manager"
import type { AuthRequest } from "../middleware/auth"
import { CreateTaskSchema, UpdateTaskSchema } from "@happyrobot/shared"
import type { TaskStatus } from "@happyrobot/shared"
import { canTransition } from "../domain/task"

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

async function attachCounts<T extends { id: string }>(
  rows: T[],
  getCounts: (ids: string[]) => Promise<Array<{ taskId: string; n: unknown }>>,
  key: string,
) {
  if (rows.length === 0) return rows.map((t) => ({ ...t, [key]: 0 }))
  const ids = rows.map((t) => t.id)
  const counts = await getCounts(ids)
  const map = Object.fromEntries(counts.map((c) => [c.taskId, Number(c.n)]))
  return rows.map((t) => ({ ...t, [key]: map[t.id] ?? 0 }))
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
    const withComments = await attachCounts(withDeps,
      (ids) => db.select({ taskId: comments.taskId, n: count() }).from(comments).where(inArray(comments.taskId, ids)).groupBy(comments.taskId),
      "commentCount",
    )
    const data = await attachCounts(withComments,
      (ids) => db.select({ taskId: attachments.taskId, n: count() }).from(attachments).where(inArray(attachments.taskId, ids)).groupBy(attachments.taskId),
      "attachmentCount",
    )

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

      await tx.insert(events).values({
        projectId,
        taskId: created.id,
        userId,
        type: "task.created",
        payload: { after: { title: created.title, status: created.status, assignedTo: created.assignedTo, configuration: created.configuration } },
        revision: created.revision,
      })

      return created
    })

    const result = { ...task, dependencies: depIds, commentCount: 0, attachmentCount: 0 }
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

    // fetch before-state for the activity log; business logic doesn't use it
    const existingDepIds = dependencyIds !== undefined
      ? (await db.select({ dependsOnId: taskDependencies.dependsOnId })
          .from(taskDependencies).where(eq(taskDependencies.taskId, taskId)))
          .map(d => d.dependsOnId)
      : []

    if (fields.status && fields.status !== existing.status) {
      if (!canTransition(existing.status as TaskStatus, fields.status)) {
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
      // optimistic concurrency: match current status so concurrent writes conflict instead of silently overwriting
      const whereClause = fields.status
        ? and(eq(tasks.id, taskId), eq(tasks.status, existing.status))
        : eq(tasks.id, taskId)

      const [task] = await tx
        .update(tasks)
        .set({ ...fields, ...(mergedConfig !== undefined ? { configuration: mergedConfig } : {}), updatedAt: new Date(), revision: sql`${tasks.revision} + 1` })
        .where(whereClause)
        .returning()

      if (!task) {
        throw Object.assign(new Error("conflict"), { statusCode: 409 })
      }

      if (dependencyIds !== undefined) {
        const depIds: string[] = Array.isArray(dependencyIds) ? dependencyIds : []
        await tx.delete(taskDependencies).where(eq(taskDependencies.taskId, taskId))
        if (depIds.length > 0) {
          await tx.insert(taskDependencies).values(
            depIds.map((depId: string) => ({ taskId, dependsOnId: depId }))
          )
        }
      }

      const before: Record<string, unknown> = {}
      const after: Record<string, unknown> = {}
      if (fields.title !== undefined) { before.title = existing.title; after.title = fields.title }
      if (fields.status !== undefined) { before.status = existing.status; after.status = fields.status }
      if (fields.assignedTo !== undefined) { before.assignedTo = existing.assignedTo; after.assignedTo = fields.assignedTo }
      if (configUpdate !== undefined) { before.configuration = existing.configuration; after.configuration = task.configuration }
      if (dependencyIds !== undefined) { before.dependencyIds = existingDepIds; after.dependencyIds = dependencyIds }

      await tx.insert(events).values({ projectId, taskId, userId, type: "task.updated", payload: { before, after }, revision: task.revision })

      return task
    })

    const [withDeps] = await attachDependencies([updatedTask])
    const [withComments] = await attachCounts(
      [withDeps],
      (ids) => db.select({ taskId: comments.taskId, n: count() }).from(comments).where(inArray(comments.taskId, ids)).groupBy(comments.taskId),
      "commentCount",
    )
    const [withAll] = await attachCounts(
      [withComments],
      (ids) => db.select({ taskId: attachments.taskId, n: count() }).from(attachments).where(inArray(attachments.taskId, ids)).groupBy(attachments.taskId),
      "attachmentCount",
    )
    const { configuration: { description: _yjsManaged, ...broadcastConfig }, ...taskRest } = withAll
    broadcast(projectId, { type: "task.updated", task: { ...taskRest, configuration: broadcastConfig } }, userId).catch(() => {})
    res.json({ task: withAll })
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 409) {
      res.status(409).json({ error: "Task was modified by someone else, please refresh" })
      return
    }
    console.error("[PATCH task]", err)
    res.status(500).json({ error: "Failed to update task" })
  }
})

router.delete("/:projectId/tasks/:taskId", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req as AuthRequest
    const { projectId, taskId } = req.params

    const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId))
    if (!existing) { res.status(404).json({ error: "Not found" }); return }

    await db.transaction(async (tx) => {
      await tx.insert(events).values({
        projectId,
        taskId,
        userId,
        type: "task.deleted",
        payload: { before: { id: taskId, title: existing.title, status: existing.status } },
        revision: null,
      })
      await tx.delete(tasks).where(eq(tasks.id, taskId))
    })

    broadcast(projectId, { type: "task.deleted", taskId }, userId).catch(() => {})
    res.status(204).end()
  } catch (err) {
    console.error("[DELETE task]", err)
    res.status(500).json({ error: "Failed to delete task" })
  }
})

export { router as tasksRouter }
