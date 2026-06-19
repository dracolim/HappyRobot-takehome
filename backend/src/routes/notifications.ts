import { Router, Request, Response } from "express"
import { db } from "../db"
import { notifications, users } from "../db/schema"
import { eq, and, desc } from "drizzle-orm"
import type { AuthRequest } from "../middleware/auth"

const router = Router()

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req as AuthRequest
  try {
    const rows = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        projectId: notifications.projectId,
        taskId: notifications.taskId,
        commentId: notifications.commentId,
        fromUserId: notifications.fromUserId,
        fromUserName: users.name,
        body: notifications.body,
        read: notifications.read,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.fromUserId))
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50)

    const unreadCount = rows.filter(n => !n.read).length
    res.json({ notifications: rows, unreadCount })
  } catch (err) {
    console.error("[GET notifications]", err)
    res.status(500).json({ error: "Failed to fetch notifications" })
  }
})

router.patch("/read-all", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req as AuthRequest
  try {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
    res.json({ ok: true })
  } catch (err) {
    console.error("[PATCH notifications/read-all]", err)
    res.status(500).json({ error: "Failed to mark notifications as read" })
  }
})

router.patch("/:id/read", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req as AuthRequest
  try {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, userId)))
    res.json({ ok: true })
  } catch (err) {
    console.error("[PATCH notification/read]", err)
    res.status(500).json({ error: "Failed to mark notification as read" })
  }
})

export { router as notificationsRouter }
