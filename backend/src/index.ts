import "dotenv/config"
import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import rateLimit from "express-rate-limit"
import { createServer } from "http"
import { authRouter } from "./routes/auth"
import { projectsRouter } from "./routes/projects"
import { tasksRouter } from "./routes/tasks"
import { commentsRouter } from "./routes/comments"
import { taskAttachmentsRouter, attachmentRouter } from "./routes/attachments"
import { notificationsRouter } from "./routes/notifications"
import { activityRouter } from "./routes/activity"
import { setupWebSocket } from "./ws/manager"
import { requireAuth, type AuthRequest } from "./middleware/auth"
import { runMigrations } from "./db/migrate"
import { ensureBucket } from "./storage/s3"

const app = express()

app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:3000", credentials: true }))
app.use(cookieParser() as unknown as express.RequestHandler)
app.use(express.json())

// trust proxy headers so req.ip is the real client IP behind a load balancer / CDN
app.set("trust proxy", 1)

// brute-force protection on auth — keyed by IP (user not authenticated yet)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later" },
})

// general API cap — keyed by userId so users behind shared IPs/NAT don't affect each other
// runs after requireAuth so userId is available
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).userId ?? req.ip ?? "unknown",
  message: { error: "Too many requests, please slow down" },
})

app.get("/health", (_, res) => res.json({ ok: true }))
app.use("/api/auth", authLimiter, authRouter)
app.use("/api/projects", requireAuth, apiLimiter, projectsRouter)
app.use("/api/projects", requireAuth, apiLimiter, tasksRouter)
app.use("/api/tasks", requireAuth, apiLimiter, commentsRouter)
app.use("/api/tasks", requireAuth, apiLimiter, taskAttachmentsRouter)
app.use("/api/attachments", requireAuth, apiLimiter, attachmentRouter)
app.use("/api/notifications", requireAuth, apiLimiter, notificationsRouter)
app.use("/api/projects", requireAuth, apiLimiter, activityRouter)

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: "Internal server error" })
})

async function start() {
  await runMigrations()
  await ensureBucket()

  const server = createServer(app)
  setupWebSocket(server)

  const port = Number(process.env.PORT ?? 8080)
  server.listen(port, () => console.log(`Server listening on :${port}`))
}

start().catch((err) => {
  console.error("Failed to start:", err)
  process.exit(1)
})
