import { randomUUID } from "crypto"
import { Router, Request, Response } from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { db } from "../db"
import { users } from "../db/schema"
import { eq } from "drizzle-orm"
import { RegisterSchema, LoginSchema } from "@happyrobot/shared"
import { requireAuth, type AuthRequest } from "../middleware/auth"
import { revokeToken } from "../revocation"

const router = Router()

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
}

function generateToken(userId: string, name: string, email: string): string {
  return jwt.sign(
    { sub: userId, name, email, jti: randomUUID() },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  )
}

router.post("/register", async (req: Request, res: Response): Promise<void> => {
  const parsed = RegisterSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" })
    return
  }

  const { email, name, password } = parsed.data
  const passwordHash = await bcrypt.hash(password, 12)

  try {
    const [user] = await db.insert(users).values({ email, name, passwordHash }).returning()
    const token = generateToken(user.id, user.name, user.email)
    res.cookie("token", token, COOKIE_OPTS)
    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name } })
  } catch {
    res.status(409).json({ error: "Email already in use" })
  }
})

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" })
    return
  }

  const { email, password } = parsed.data
  const [user] = await db.select().from(users).where(eq(users.email, email))

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid credentials" })
    return
  }

  const token = generateToken(user.id, user.name, user.email)
  res.cookie("token", token, COOKIE_OPTS)
  res.json({ user: { id: user.id, email: user.email, name: user.name } })
})

router.post("/logout", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const jti = (req as AuthRequest).tokenJti
  if (jti) {
    const raw = req.cookies?.token ?? req.headers.authorization?.slice(7)
    const payload = raw ? (jwt.decode(raw) as { exp?: number } | null) : null
    const ttl = payload?.exp ? Math.max(0, payload.exp - Math.floor(Date.now() / 1000)) : 0
    await revokeToken(jti, ttl)
  }
  res.clearCookie("token", COOKIE_OPTS)
  res.json({ ok: true })
})

export { router as authRouter }
