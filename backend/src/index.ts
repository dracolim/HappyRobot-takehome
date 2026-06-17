import "dotenv/config"
import express from "express"
import cors from "cors"
import { createServer } from "http"
import { authRouter } from "./routes/auth"
import { projectsRouter } from "./routes/projects"
import { tasksRouter } from "./routes/tasks"
import { commentsRouter } from "./routes/comments"
import { setupWebSocket } from "./ws/manager"
import { requireAuth } from "./middleware/auth"
import { runMigrations } from "./db/migrate"

const app = express()

app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:3000", credentials: true }))
app.use(express.json())

app.get("/health", (_, res) => res.json({ ok: true }))
app.use("/api/auth", authRouter)
app.use("/api/projects", requireAuth, projectsRouter)
app.use("/api/projects", requireAuth, tasksRouter)
app.use("/api/tasks", requireAuth, commentsRouter)

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: "Internal server error" })
})

async function start() {
  await runMigrations()

  const server = createServer(app)
  setupWebSocket(server)

  const port = Number(process.env.PORT ?? 8080)
  server.listen(port, () => console.log(`Server listening on :${port}`))
}

start().catch((err) => {
  console.error("Failed to start:", err)
  process.exit(1)
})
