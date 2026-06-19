import { Router } from "express"
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import type { Readable } from "node:stream"
import { db } from "../db"
import { attachments, tasks } from "../db/schema"
import { eq, count } from "drizzle-orm"
import { s3, BUCKET, createPresignedPutUrl } from "../storage/s3"
import type { AuthRequest } from "../middleware/auth"
import { broadcast } from "../ws/manager"

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

// Step 1: issue a short-lived presigned PUT URL — browser uploads directly to MinIO/R2
taskAttachmentsRouter.post("/:taskId/attachments/presign", async (req, res): Promise<void> => {
  try {
    const { userId } = req as unknown as AuthRequest
    const taskId = req.params.taskId as string
    const { filename, mimeType } = req.body as { filename?: string; mimeType?: string }

    if (!filename || !mimeType) { res.status(400).json({ error: "filename and mimeType required" }); return }

    const [task] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId))
    if (!task) { res.status(404).json({ error: "Task not found" }); return }

    const objectKey = `${taskId}/${Date.now()}-${filename}`
    const presignedUrl = await createPresignedPutUrl(objectKey, mimeType)

    res.json({ presignedUrl, objectKey })
  } catch (err) {
    console.error("[POST presign]", err)
    res.status(500).json({ error: "Failed to generate upload URL" })
  }
})

// Step 2: browser has uploaded directly to MinIO — register the attachment in DB and broadcast
taskAttachmentsRouter.post("/:taskId/attachments/confirm", async (req, res): Promise<void> => {
  try {
    const { userId } = req as unknown as AuthRequest
    const taskId = req.params.taskId as string
    const { objectKey, filename, size, mimeType } = req.body as {
      objectKey?: string; filename?: string; size?: number; mimeType?: string
    }

    if (!objectKey || !filename || !size || !mimeType) {
      res.status(400).json({ error: "objectKey, filename, size and mimeType required" }); return
    }

    const [task] = await db.select({ id: tasks.id, projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, taskId))
    if (!task) { res.status(404).json({ error: "Task not found" }); return }

    const [attachment] = await db
      .insert(attachments)
      .values({ taskId, uploaderId: userId, filename, objectKey, size, mimeType })
      .returning()

    const [{ attachmentCount }] = await db
      .select({ attachmentCount: count() })
      .from(attachments)
      .where(eq(attachments.taskId, taskId))

    broadcast(task.projectId, { type: "attachment.created", taskId, attachment, attachmentCount }, userId).catch(() => {})
    res.status(201).json({ attachment, attachmentCount })
  } catch (err) {
    console.error("[POST confirm]", err)
    res.status(500).json({ error: "Failed to confirm upload" })
  }
})

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

    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`)
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
