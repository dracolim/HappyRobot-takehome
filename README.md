# HappyRobot Task Manager

A real-time collaborative task management system built with

- **Frontend:** Next.js
- **Backend:** Express.js, Redis, MinIO
- **Database:** PostgreSQL

---

## Setup

**Requirements:** Docker and Docker Compose only.

```bash
docker compose up --build
```

All services start with working defaults — no config needed.

| Service       | URL                   |
| ------------- | --------------------- |
| Frontend      | http://localhost:3000 |
| Backend API   | http://localhost:8080 |
| MinIO console | http://localhost:9001 |

---

## Objectives

| Requirement                                                | Status |
| ---------------------------------------------------------- | ------ |
| Users can create multiple projects                         | ✓      |
| Add, update, and delete tasks within projects              | ✓      |
| Task dependencies and status transitions                   | ✓      |
| Comment threads with real-time updates                     | ✓      |
| Changes visible to all clients in near real-time           | ✓      |
| Consistency maintained across clients                      | ✓      |
| No Firebase, Supabase, or managed real-time DB             | ✓      |
| Efficient delta-only transmission (no full payload resend) | ✓      |

---

## Bonus Points

| Bonus                               | Implemented | Notes                                                                          |
| ----------------------------------- | ----------- | ------------------------------------------------------------------------------ |
| CRDT-inspired approach              | ✓           | Full Yjs CRDT on the description field                                         |
| Event-based backend                 | ✓           | Append-only `events` table with `before`/`after` payload and revision number   |
| Clear domain model                  | ✓           | `domain/task.ts` owns all status transition rules; shared package owns schemas |
| Type-safe API contract              | ✓           | Zod schemas in `@happyrobot/shared` — backend validates, frontend infers types |
| Optimistic UI updates with rollback | ✓           | State updates before server responds; rolls back on 4xx/5xx                    |
| Database transactions               | ✓           | All multi-step writes (task create, update, delete) wrapped in transactions    |
| Caching strategy                    | ✓           | Redis for WS fan-out, presence TTL, JWT revocation                             |
| Rate limiting and backpressure      | ✓           | Token bucket per userId on WS; per-IP on auth; per-userId on REST              |
| Undo/Redo                           | —           | Not implemented                                                                |

---

## Extended Challenges

### Option 2 — Advanced Collaboration

**User presence indicators**
Redis sorted sets track who is viewing each task. Live avatar stacks appear on task cards and inside the task modal, showing each user's name and whether they are viewing or editing.

**Live cursor sharing**
Cursor positions are shared via `y-protocols/awareness`. Each cursor is anchored to a CRDT item identity (not a raw character index), so it tracks correctly even when other users insert or delete text around it. Each collaborator gets a distinct color. New joiners see all live cursors immediately — no keypress required.

**Collaborative text editing**
The task description uses Yjs CRDT. Multiple users can type simultaneously and edits always converge to the same result. Saving is explicit — clicking Save commits the change; Cancel reverts the document and broadcasts the revert to all collaborators.
<br/>
<img width="1170" height="794" alt="Screenshot 2026-06-19 at 10 15 41 AM" src="https://github.com/user-attachments/assets/3a6cac80-bd2d-4676-86fa-979cc998a25d" />

**Activity feed with real-time notifications**
Every task mutation is written to an append-only `events` table and broadcast as a socket event. The sidebar feed updates live and shows exactly what changed: `moved from To Do → In Review`, `renamed "Old" → "New"`.

<img width="323" height="500" alt="Screenshot 2026-06-19 at 9 32 20 AM" src="https://github.com/user-attachments/assets/93787220-80f6-44a3-bfdf-b2022a6bdcd5" />


**@mentions with notifications**
`@name` patterns in comments are parsed on the backend. Mentioned members receive an in-app notification over WebSocket, persisted in the `notifications` table across sessions.
<br/>
<img width="400" height="600" alt="Screenshot 2026-06-19 at 9 32 05 AM" src="https://github.com/user-attachments/assets/1639459b-27a5-412e-970c-209118515267" />
<img width="400" height="150" alt="Screenshot 2026-06-19 at 9 31 38 AM" src="https://github.com/user-attachments/assets/c56176a0-f4d3-46fb-88ff-dd5f8136e709" />


### Option 4 — Open-Ended Extension

**Kanban board with drag-and-drop**
Built with `@dnd-kit`. Cards drag between status columns. Dropping a task into "Done" when its dependencies are incomplete is blocked at both the UI and API level.
<img width="1705" height="875" alt="Screenshot 2026-06-19 at 10 17 30 AM" src="https://github.com/user-attachments/assets/2539cc66-4924-4640-b759-98a023aa8d3f" />

**Task dependency DAG**
Tasks declare dependencies on other tasks, rendered as a directed acyclic graph. A task cannot move to "done" until all its dependencies are complete — enforced in the domain layer and at the API.
<img width="847" height="320" alt="Screenshot 2026-06-19 at 10 18 59 AM" src="https://github.com/user-attachments/assets/e11b0c9f-1156-4445-9e87-d1714634cf5a" />

---

## Architecture Decisions
### Data Model Diagram
<img width="750" height="1000" alt="image" src="https://github.com/user-attachments/assets/13a331e1-bf65-46fe-bd22-c95bc9b926f9" />

###  Container Diagram
<img width="646" height="779" alt="image" src="https://github.com/user-attachments/assets/0e6891e8-d28e-42f0-a145-4b362fffde77" />


**REST for writes + WebSocket for push, backed by Redis pub/sub.**

Every mutation goes through a REST route: validated, written to Postgres, then published to a Redis channel.
WebSocket is push-only meaning the server fans out the event to every connected client in the project. This keeps the two concerns independent: the REST API works standalone, and WebSocket adds liveness without becoming a write path.

The **domain layer** (`domain/task.ts`) owns all status transition rules. The **shared package** (`@happyrobot/shared`) holds Zod schemas used by both backend validation and frontend type inference — one source of truth, no drift.

**Auth** uses JWT in an `HttpOnly; SameSite=Lax` cookie — no localStorage XSS risk. On logout, the token's `jti` is added to a Redis revocation set so it cannot be replayed.

---

## How We Handle Sync

**Delta-only events**
The server never sends the full board.

- Each mutation produces a typed event (`task.updated`, `comment.created`, etc.) containing only the changed entity.
- When it arrives, the browser updates its in-memory data directly with no API call needed.

**Optimistic updates**
The UI updates immediately on user action. If the server rejects it (validation error or 409 conflict), the previous state is restored.

**Collaborative text editing (CRDT)**
The description field uses Yjs.

- Each keystroke sends only the changed characters (~30 bytes for a 1-character edit), not the full text.
- The backend applies it to an in-memory Yjs document and broadcasts to other clients immediately. The database write is debounced by 3 seconds — an active editor types 5–10 keystrokes per second; writing to Postgres on every keystroke would create unsustainable write load so the debounce batches an entire burst into one DB write per editing pause.
- We chose CRDT over Operational Transform because operations are commutative by design — any order of delivery converges to the same result, which fits a stateless backend and makes horizontal scaling straightforward.

**Presence**

- Tracked in Redis sorted sets with 90-second TTL.
- The frontend pings every 30 seconds when active. This handles unreliable disconnects (mobile, OS kills) without needing a reliable close event.
- On explicit logout or component unmount, a `presence.offline` message is sent immediately as a best-effort fast path.

---

## Race Conditions and Concurrent Access

| #   | Race                                                                              | Fix                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Two users update the same task simultaneously                                     | Conditional `WHERE status = $expected` — returns 409 if already changed; optimistic update rolls back                                                  |
| 2   | Two users type in the description at the same time                                | Yjs CRDT — operations are commutative, always converge; idempotent on duplicate delivery                                                               |
| 3   | Cursor index drifts when another user inserts/deletes text                        | Cursors stored as CRDT relative positions, not raw indices — resolved against the latest doc state                                                     |
| 4   | User stays "online" after browser is killed                                       | TTL heartbeat — presence auto-expires after 90s without a ping                                                                                         |
| 5   | Mode (Viewing/Editing) change events arrive out of order                          | Server broadcasts both a delta and a full authoritative presence state on mode change                                                                  |
| 6   | Non-description fields (title, priority, status) going out of sync across clients | Every successful save broadcasts `task.updated` to the entire project channel — all connected clients are guaranteed to see the latest committed state |

---

## How We'd Scale the System Over Time

| Stage             | Users     | Bottleneck                                  | Fix                                                                 |
| ----------------- | --------- | ------------------------------------------- | ------------------------------------------------------------------- |
| Single instance   | < 5k      | Yjs heap memory                             | Evict idle docs after 10 min (shipped)                              |
| Horizontal scale  | 5k – 100k | Diverged Yjs state, per-process rate limits | Load balancer + sticky sessions by `projectId` + `rate-limit-redis` |
| High availability | Any       | Redis SPOF, pod crash data loss             | Redis Sentinel + `y-redis` Streams                                  |
| Hyperscale        | 100k+     | WebSocket fan-out, DB write load            | Kafka; managed real-time layer; geographic sharding                 |

<img width="1661" height="481" alt="image" src="https://github.com/user-attachments/assets/7ce59d9a-e388-4ca0-a4ab-edb133df87d7" />

**Scaling the real-time layer**

Since REST is stateless, I'd **add more servers behind a load balancer**.

For websocket, it is a bit more complicated. The Yjs document lives in each server's memory. If User A is on Server 1 and User B is on Server 2, they're looking at two different copies of the document and their edits will diverge. The load balancer can't just round-robin WebSocket connections so it needs to pin all members of the same project to the same server. I'd do this with **consistent-hashing on `projectId`**, which keeps the Yjs doc shared without needing a distributed document store.

That solves divergence, but creates a new problem where a write on Server 1 only fans out to Server 1's WebSocket clients. User B on Server 2 never sees it. **Redis pub/sub bridges** this. Every server publishes writes to a **shared Redis channel** and subscribes to receive them, then fans out to its own connected clients.

```
User A types
    │
    ▼
Server 1 ──PUBLISH──▶ Redis channel "project:abc"
                              │
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
            Server 1      Server 2      Server N
                 │            │            │
                 ▼            ▼            ▼
           User A (WS)   User B (WS)  User C (WS)
```

Redis also becomes the shared state layer for everything that needs to be consistent across servers: who's online, rate limit counters, revoked JWT tokens. Any server can answer any question without needing to coordinate with another.

**Handling Yjs write volume**

An active editor fires 5–10 Yjs updates per second. Writing each one directly to Postgres would be unsustainable, that's a potential 600 writes per minute per active user. So I'd **broadcast updates to collaborators immediately but debounce the database write by 3 seconds, flushing once per editing pause instead of on every keystroke**.

The downside is that if the server crashes within that 3-second window, those edits are gone. The fix is to this is `y-redis` — before broadcasting each Yjs update, append it to a Redis Stream. The stream is the durable record; Postgres is just the periodic snapshot. This gives per-operation durability without the write load.

**Where the database breaks down**

A query like "fetch all tasks for project X sorted by creation time" does a full table scan without an index on `(project_id, created_at)`. The `events` table is one table that it's append-only and grows forever; without an index it gets slower every day.

After indexes, connection limits become the problem. Postgres has a hard ceiling on concurrent connections. With many servers each holding a connection pool, that ceiling is hit fast. **PgBouncer** sits in front of Postgres and multiplexes thousands of application connections into a smaller number of real database connections, with no application code changes.

The `events` table also needs **partitioning**. Splitting by month means old data can be archived to S3 as Parquet and dropped from Postgres instantly by detaching a partition rather than running a slow DELETE across millions of rows. The cold data stays queryable via Athena if needed for audits.

**At hyperscale**

Redis pub/sub starts to break at very high throughput as it's single-threaded, and messages that aren't consumed when delivered are just gone. I'd replace it with **Kafka**; durable, ordered, and each consumer (analytics pipeline, notification service, search indexer) gets its own independent offset so they can read at their own pace without affecting each other or losing events on restart.

**Geographic routing** matters too. Latency in collaborative editing is felt immediately — a 200ms round trip is noticeable when watching a cursor move. I'd route users to the nearest region, with `projectId` sharding keeping a project's members co-located within that region.


## Tradeoffs Made

**CRDT (Yjs) over Operational Transform**
OT was the other option. The catch is that it requires a central server to serialize and transform every concurrent operation before applying it, which means a single authoritative node and transform logic that's hard to implement correctly.
Where else CRDT takes a different approach: operations are designed to be commutative, so any delivery order converges to the same result without a central arbiter. That fits naturally with a stateless backend. The downside is higher memory per document as Yjs stores full operation history internally. For *task descriptions* this is a non-issue, but for very large documents OT's lower footprint would matter more.

**Explicit save over auto-save**
Auto-save sounds friendlier but it creates a real problem: what does "cancel" mean when edits are already committed? You'd need to track every intermediate state and offer a way to revert it. Explicit Save/Cancel avoids this entirely as the author controls when collaborators see their changes, and Cancel always reverts cleanly with no ambiguity. The cost is that in-progress edits are invisible to others until Save is clicked. For a task description that's the right call.

**REST + WebSocket over WebSocket-only**
The cost of this approach is that the client has to manage two connection types — a fetch-based API client for writes and a WebSocket for push, each with their own auth path, error handling, and reconnect logic. A WebSocket-only design would simplify the client to a single connection and a single auth flow.

The reason I kept them separate is that writes need a response — did it succeed, conflict, fail validation? Over WebSocket you'd have to build your own request/response correlation and error codes from scratch. HTTP gives status codes, auth middleware, rate limiting, and input validation out of the box. The extra client complexity is worth not reimplementing all of that.

---

## Technology Choices

| Technology                  | Why                                                                                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js 16 (App Router)** | Preferred stack per spec; server components for the shell, client components for the interactive Kanban                                                                                                           |
| **Express + TypeScript**    | Lightweight composable middleware — auth, rate limiting, and WebSocket on the same HTTP server. Stateless for REST, so API pods scale horizontally behind a load balancer without coordination                    |
| **Drizzle ORM**             | Type-safe SQL; schema file is the source of truth for TypeScript types                                                                                                                                            |
| **PostgreSQL 16**           | Relational integrity for the dependency DAG; JSONB for flexible task configuration                                                                                                                                |
| **Redis 7**                 | Three distinct uses: pub/sub fans out WebSocket events across all backend pods; sorted sets track presence with O(log n) TTL expiry; a revocation set invalidates JWTs on logout without a stateful session store |
| **MinIO**                   | S3-compatible object storage in Docker — files upload directly from browser via presigned URLs, bypassing the backend entirely                                                                                    |
| **Yjs**                     | Battle-tested CRDT; `y-protocols/awareness` gives cursor sharing for free                                                                                                                                         |
| **Zod (shared package)**    | One schema, used for backend validation and frontend type inference — no duplication                                                                                                                              |
| **@dnd-kit**                | Accessible drag-and-drop; works cleanly with dependency-aware drop guards                                                                                                                                         |
