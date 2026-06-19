import { pgTable, uuid, text, timestamp, jsonb, primaryKey, bigint, integer, boolean } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  ownerId: uuid("owner_id").references(() => users.id).notNull(),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const projectMembers = pgTable("project_members", {
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: text("role").notNull().default("member"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.projectId, t.userId] })])

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("todo"),
  assignedTo: text("assigned_to").array().notNull().default([]),
  configuration: jsonb("configuration")
    .$type<{
      priority: "low" | "medium" | "high" | "urgent"
      description: string
      tags: string[]
      customFields: Record<string, unknown>
    }>()
    .notNull(),
  revision: integer("revision").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const taskDependencies = pgTable("task_dependencies", {
  taskId: uuid("task_id")
    .references(() => tasks.id, { onDelete: "cascade" })
    .notNull(),
  dependsOnId: uuid("depends_on_id")
    .references(() => tasks.id, { onDelete: "cascade" })
    .notNull(),
})

export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id")
    .references(() => tasks.id, { onDelete: "cascade" })
    .notNull(),
  authorId: uuid("author_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload")
    .$type<{ before?: Record<string, unknown>; after?: Record<string, unknown> }>()
    .notNull()
    .default({}),
  revision: integer("revision"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const attachments = pgTable("attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  uploaderId: uuid("uploader_id").references(() => users.id).notNull(),
  filename: text("filename").notNull(),
  objectKey: text("object_key").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
  fromUserId: uuid("from_user_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
