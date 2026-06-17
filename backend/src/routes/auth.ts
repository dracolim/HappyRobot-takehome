import { Router, Request, Response } from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { z } from "zod"
import { db } from "../db"
import { users } from "../db/schema"
import { eq } from "drizzle-orm"

const router = Router()

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

function generateToken(userId: string): string {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET!, { expiresIn: "7d" })
}

router.post("/register", async (req: Request, res: Response): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" })
    return
  }

  const { email, name, password } = parsed.data
  const passwordHash = await bcrypt.hash(password, 12)

  try {
    const [user] = await db.insert(users).values({ email, name, passwordHash }).returning()
    res.status(201).json({
      token: generateToken(user.id),
      user: { id: user.id, email: user.email, name: user.name },
    })
  } catch {
    res.status(409).json({ error: "Email already in use" })
  }
})

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body)
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

  res.json({
    token: generateToken(user.id),
    user: { id: user.id, email: user.email, name: user.name },
  })
})

export { router as authRouter }
