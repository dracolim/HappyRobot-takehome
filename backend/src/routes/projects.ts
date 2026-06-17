import { Router, Request, Response } from "express"
import { z } from "zod"
import { db } from "../db"
import { projects } from "../db/schema"
import { eq } from "drizzle-orm"
import type { AuthRequest } from "../middleware/auth"

const router = Router()

const projectSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
})

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req as AuthRequest
  const rows = await db.select().from(projects).where(eq(projects.ownerId, userId))
  res.json({ projects: rows })
})

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const [project] = await db.select().from(projects).where(eq(projects.id, req.params.id))
  if (!project) { res.status(404).json({ error: "Not found" }); return }
  res.json({ project })
})

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req as AuthRequest
  const parsed = projectSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return }

  const [project] = await db
    .insert(projects)
    .values({ ...parsed.data, ownerId: userId })
    .returning()

  res.status(201).json({ project })
})

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const [project] = await db
    .update(projects)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(projects.id, req.params.id))
    .returning()

  if (!project) { res.status(404).json({ error: "Not found" }); return }
  res.json({ project })
})

router.delete("/:id", async (_req: Request, res: Response): Promise<void> => {
  await db.delete(projects).where(eq(projects.id, _req.params.id))
  res.status(204).end()
})

export { router as projectsRouter }
