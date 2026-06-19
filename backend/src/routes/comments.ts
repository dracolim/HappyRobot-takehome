import { Router, Request, Response } from "express"
import { db } from "../db"
import { comments, users, tasks, projectMembers, events, notifications } from "../db/schema"
import { eq, inArray } from "drizzle-orm"
import { broadcast, sendToUser } from "../ws/manager"
import type { AuthRequest } from "../middleware/auth"
import { CreateCommentSchema } from "@happyrobot/shared"

const router = Router()

router.get("/:taskId/comments", async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: comments.id,
        taskId: comments.taskId,
        content: comments.content,
        authorId: comments.authorId,
        createdAt: comments.createdAt,
        author: { id: users.id, name: users.name, email: users.email },
      })
      .from(comments)
      .leftJoin(users, eq(comments.authorId, users.id))
      .where(eq(comments.taskId, req.params.taskId))
      .orderBy(comments.createdAt)

    res.json({ comments: rows })
  } catch (err) {
    console.error("[GET comments]", err)
    res.status(500).json({ error: "Failed to fetch comments" })
  }
})

router.post("/:taskId/comments", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req as AuthRequest
    const { taskId } = req.params

    const parsed = CreateCommentSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return }
    const { content } = parsed.data

    const [task] = await db
      .select({ projectId: tasks.projectId, title: tasks.title })
      .from(tasks)
      .where(eq(tasks.id, taskId))
    if (!task) { res.status(404).json({ error: "Task not found" }); return }

    const [comment] = await db.insert(comments).values({ taskId, authorId: userId, content }).returning()

    const [withAuthor] = await db
      .select({
        id: comments.id,
        taskId: comments.taskId,
        content: comments.content,
        authorId: comments.authorId,
        createdAt: comments.createdAt,
        author: { id: users.id, name: users.name, email: users.email },
      })
      .from(comments)
      .leftJoin(users, eq(comments.authorId, users.id))
      .where(eq(comments.id, comment.id))

    // Log to activity feed
    await db.insert(events).values({
      projectId: task.projectId,
      taskId,
      userId,
      type: "task.comment",
      payload: {},
    }).catch(() => {})

    // Parse @mentions and notify mentioned members
    const handles = [...new Set((content.match(/@(\w+)/g) ?? []).map(m => m.slice(1).toLowerCase()))]
    if (handles.length > 0) {
      const members = await db
        .select({ userId: projectMembers.userId, name: users.name })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(eq(projectMembers.projectId, task.projectId))

      for (const handle of handles) {
        const mentioned = members.find(m => {
          const parts = m.name.toLowerCase().split(/\s+/)
          return parts[0] === handle || parts.join("") === handle
        })
        if (!mentioned || mentioned.userId === userId) continue

        const [notif] = await db
          .insert(notifications)
          .values({
            userId: mentioned.userId,
            type: "mention",
            projectId: task.projectId,
            taskId,
            commentId: comment.id,
            fromUserId: userId,
            body: `mentioned you in "${task.title}"`,
          })
          .returning()

        sendToUser(mentioned.userId, {
          type: "notification.created",
          notification: {
            ...notif,
            fromUserName: withAuthor.author?.name ?? "Someone",
          },
        }).catch(() => {})
      }
    }

    broadcast(task.projectId, { type: "comment.created", comment: withAuthor }, userId).catch(() => {})
    res.status(201).json({ comment: withAuthor })
  } catch (err) {
    console.error("[POST comment]", err)
    res.status(500).json({ error: "Failed to post comment" })
  }
})

export { router as commentsRouter }
