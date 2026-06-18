import { Router, Request, Response } from "express"
import { db } from "../db"
import { comments, users, tasks } from "../db/schema"
import { eq } from "drizzle-orm"
import { broadcast } from "../ws/manager"
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

    const [task] = await db.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, taskId))
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

    broadcast(task.projectId, { type: "comment.created", comment: withAuthor }, userId).catch(() => {})
    res.status(201).json({ comment: withAuthor })
  } catch (err) {
    console.error("[POST comment]", err)
    res.status(500).json({ error: "Failed to post comment" })
  }
})

export { router as commentsRouter }
