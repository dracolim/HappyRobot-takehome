import { Router, Request, Response } from "express"
import { db } from "../db"
import { comments, users } from "../db/schema"
import { eq } from "drizzle-orm"
import { broadcast } from "../ws/manager"
import type { AuthRequest } from "../middleware/auth"

const router = Router()

router.get("/:taskId/comments", async (req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select({
      id: comments.id,
      taskId: comments.taskId,
      content: comments.content,
      authorId: comments.authorId,
      createdAt: comments.createdAt,
      author: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(comments)
    .leftJoin(users, eq(comments.authorId, users.id))
    .where(eq(comments.taskId, req.params.taskId))
    .orderBy(comments.createdAt)

  res.json({ comments: rows })
})

router.post("/:taskId/comments", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req as AuthRequest
  const { taskId } = req.params
  const { content } = req.body

  if (!content) { res.status(400).json({ error: "content required" }); return }

  const [comment] = await db
    .insert(comments)
    .values({ taskId, authorId: userId, content })
    .returning()

  await broadcast(taskId, { type: "comment.created", comment }, userId)
  res.status(201).json({ comment })
})

export { router as commentsRouter }
