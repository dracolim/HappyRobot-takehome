import { Router, Request, Response } from "express"
import { db } from "../db"
import { projects, projectMembers, users } from "../db/schema"
import { and, eq, inArray } from "drizzle-orm"
import type { AuthRequest } from "../middleware/auth"
import { CreateProjectSchema, UpdateProjectSchema, InviteMemberSchema } from "@happyrobot/shared"
import { broadcast } from "../ws/manager"

const router = Router()

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req as AuthRequest
    const memberRows = await db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId))

    if (memberRows.length === 0) { res.json({ projects: [] }); return }

    const rows = await db
      .select()
      .from(projects)
      .where(inArray(projects.id, memberRows.map((r) => r.projectId)))

    res.json({ projects: rows })
  } catch (err) {
    console.error("[GET projects]", err)
    res.status(500).json({ error: "Failed to fetch projects" })
  }
})

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req as AuthRequest
    const [member] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, req.params.id), eq(projectMembers.userId, userId)))

    if (!member) { res.status(403).json({ error: "Access denied" }); return }

    const [project] = await db.select().from(projects).where(eq(projects.id, req.params.id))
    if (!project) { res.status(404).json({ error: "Not found" }); return }
    res.json({ project })
  } catch (err) {
    console.error("[GET project]", err)
    res.status(500).json({ error: "Failed to fetch project" })
  }
})

router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req as AuthRequest
    const parsed = CreateProjectSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return }

    const [project] = await db
      .insert(projects)
      .values({ ...parsed.data, ownerId: userId })
      .returning()

    await db.insert(projectMembers).values({ projectId: project.id, userId, role: "owner" })

    res.status(201).json({ project })
  } catch (err) {
    console.error("[POST project]", err)
    res.status(500).json({ error: "Failed to create project" })
  }
})

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req as AuthRequest
    const parsed = UpdateProjectSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return }

    const [member] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, req.params.id), eq(projectMembers.userId, userId)))

    if (!member) { res.status(403).json({ error: "Access denied" }); return }

    const [project] = await db
      .update(projects)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(projects.id, req.params.id))
      .returning()

    if (!project) { res.status(404).json({ error: "Not found" }); return }

    broadcast(req.params.id, { type: "project.updated", project }, userId).catch(() => {})
    res.json({ project })
  } catch (err) {
    console.error("[PATCH project]", err)
    res.status(500).json({ error: "Failed to update project" })
  }
})

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req as AuthRequest
    const [member] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, req.params.id), eq(projectMembers.userId, userId)))

    if (!member || member.role !== "owner") { res.status(403).json({ error: "Only owners can delete projects" }); return }

    await db.delete(projects).where(eq(projects.id, req.params.id))
    res.status(204).end()
  } catch (err) {
    console.error("[DELETE project]", err)
    res.status(500).json({ error: "Failed to delete project" })
  }
})

// --- Members ---

router.get("/:id/members", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req as AuthRequest
    const [self] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, req.params.id), eq(projectMembers.userId, userId)))

    if (!self) { res.status(403).json({ error: "Access denied" }); return }

    const members = await db
      .select({
        userId: projectMembers.userId,
        role: projectMembers.role,
        joinedAt: projectMembers.joinedAt,
        name: users.name,
        email: users.email,
      })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, req.params.id))

    res.json({ members })
  } catch (err) {
    console.error("[GET members]", err)
    res.status(500).json({ error: "Failed to fetch members" })
  }
})

router.post("/:id/members", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req as AuthRequest

    const parsed = InviteMemberSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return }
    const { email } = parsed.data

    const [self] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, req.params.id), eq(projectMembers.userId, userId)))

    if (!self || self.role !== "owner") { res.status(403).json({ error: "Only owners can invite members" }); return }

    const [invitee] = await db.select().from(users).where(eq(users.email, email))
    if (!invitee) { res.status(404).json({ error: "No account found for that email" }); return }

    await db
      .insert(projectMembers)
      .values({ projectId: req.params.id, userId: invitee.id, role: "member" })
      .onConflictDoNothing()

    res.status(201).json({
      member: { userId: invitee.id, name: invitee.name, email: invitee.email, role: "member" },
    })
  } catch (err) {
    console.error("[POST member]", err)
    res.status(500).json({ error: "Failed to invite member" })
  }
})

router.delete("/:id/members/:memberId", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req as AuthRequest

    const [self] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, req.params.id), eq(projectMembers.userId, userId)))

    if (!self || self.role !== "owner") { res.status(403).json({ error: "Only owners can remove members" }); return }

    await db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, req.params.id),
          eq(projectMembers.userId, req.params.memberId)
        )
      )

    res.status(204).end()
  } catch (err) {
    console.error("[DELETE member]", err)
    res.status(500).json({ error: "Failed to remove member" })
  }
})

export { router as projectsRouter }
