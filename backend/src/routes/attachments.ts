import { Router, type RequestHandler } from "express"
import multer from "multer"
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import type { Readable } from "node:stream"
import { db } from "../db"
import { attachments, tasks } from "../db/schema"
import { eq } from "drizzle-orm"
import { s3, BUCKET } from "../storage/s3"
import type { AuthRequest } from "../middleware/auth"
import { broadcast } from "../ws/manager"

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

// Mounted at /api/tasks
export const taskAttachmentsRouter = Router()

taskAttachmentsRouter.get("/:taskId/attachments", async (req, res): Promise<void> => {
  try {
    const taskId = req.params.taskId as string
    const rows = await db
      .select()
      .from(attachments)
      .where(eq(attachments.taskId, taskId))
      .orderBy(attachments.createdAt)
    res.json({ attachments: rows })
  } catch (err) {
    console.error("[GET attachments]", err)
    res.status(500).json({ error: "Failed to fetch attachments" })
  }
})

taskAttachmentsRouter.post(
  "/:taskId/attachments",
  upload.single("file") as unknown as RequestHandler,
  async (req, res): Promise<void> => {
    try {
      const { userId } = req as unknown as AuthRequest
      const taskId = req.params.taskId as string

      if (!req.file) { res.status(400).json({ error: "No file provided" }); return }

      const [task] = await db.select({ id: tasks.id, projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, taskId))
      if (!task) { res.status(404).json({ error: "Task not found" }); return }

      const objectKey = `${taskId}/${Date.now()}-${req.file.originalname}`

      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: objectKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }))

      const [attachment] = await db
        .insert(attachments)
        .values({ taskId, uploaderId: userId, filename: req.file.originalname, objectKey, size: req.file.size, mimeType: req.file.mimetype })
        .returning()

      broadcast(task.projectId, { type: "attachment.created", taskId, attachment }, userId).catch(() => {})
      res.status(201).json({ attachment })
    } catch (err) {
      console.error("[POST attachment]", err)
      res.status(500).json({ error: "Failed to upload file" })
    }
  }
)

// Mounted at /api/attachments
export const attachmentRouter = Router()

attachmentRouter.get("/:attachmentId/download", async (req, res): Promise<void> => {
  try {
    const attachmentId = req.params.attachmentId as string
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attachmentId))

    if (!attachment) { res.status(404).json({ error: "Not found" }); return }

    const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: attachment.objectKey }))

    res.setHeader("Content-Disposition", `attachment; filename="${attachment.filename}"`)
    res.setHeader("Content-Type", attachment.mimeType)
    ;(response.Body as Readable).pipe(res)
  } catch (err) {
    console.error("[GET attachment download]", err)
    res.status(500).json({ error: "Failed to download file" })
  }
})

attachmentRouter.delete("/:attachmentId", async (req, res): Promise<void> => {
  try {
    const { userId } = req as unknown as AuthRequest
    const attachmentId = req.params.attachmentId as string

    const [row] = await db
      .select({ attachment: attachments, projectId: tasks.projectId })
      .from(attachments)
      .innerJoin(tasks, eq(tasks.id, attachments.taskId))
      .where(eq(attachments.id, attachmentId))

    if (!row) { res.status(404).json({ error: "Not found" }); return }
    if (row.attachment.uploaderId !== userId) { res.status(403).json({ error: "Forbidden" }); return }

    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: row.attachment.objectKey }))
    await db.delete(attachments).where(eq(attachments.id, attachmentId))

    broadcast(row.projectId, { type: "attachment.deleted", taskId: row.attachment.taskId, attachmentId }, userId).catch(() => {})
    res.status(204).end()
  } catch (err) {
    console.error("[DELETE attachment]", err)
    res.status(500).json({ error: "Failed to delete file" })
  }
})
