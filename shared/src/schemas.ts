import { z } from "zod"

// ── Enums ────────────────────────────────────────────────────────────────────

export const TaskStatusSchema = z.enum(["todo", "in_progress", "in_review", "done"])
export const TaskPrioritySchema = z.enum(["low", "medium", "high", "urgent"])

// ── Task ─────────────────────────────────────────────────────────────────────

export const TaskConfigurationSchema = z.object({
  priority: TaskPrioritySchema.default("medium"),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.string(), z.unknown()).default({}),
})

export const CreateTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  status: TaskStatusSchema.default("todo"),
  assignedTo: z.array(z.string()).default([]),
  configuration: TaskConfigurationSchema.partial().default({}),
  dependencyIds: z.array(z.string()).default([]),
})

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  status: TaskStatusSchema.optional(),
  assignedTo: z.array(z.string()).optional(),
  configuration: TaskConfigurationSchema.partial().optional(),
  dependencyIds: z.array(z.string()).optional(),
})

// ── Project ───────────────────────────────────────────────────────────────────

export const CreateProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().default(""),
})

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
})

// ── Auth ──────────────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// ── Comments ──────────────────────────────────────────────────────────────────

export const CreateCommentSchema = z.object({
  content: z.string().min(1, "Comment cannot be empty"),
})

// ── Members ───────────────────────────────────────────────────────────────────

export const InviteMemberSchema = z.object({
  email: z.string().email(),
})

// ── Inferred TypeScript types (frontend imports these) ───────────────────────

export type TaskStatus = z.infer<typeof TaskStatusSchema>
export type TaskPriority = z.infer<typeof TaskPrioritySchema>
export type TaskConfiguration = z.infer<typeof TaskConfigurationSchema>
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>
export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>
