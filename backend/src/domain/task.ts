import { VALID_TRANSITIONS } from "@happyrobot/shared"
import type { TaskStatus } from "@happyrobot/shared"

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to)
}

export function getValidTransitions(status: TaskStatus): TaskStatus[] {
  return (VALID_TRANSITIONS[status] ?? []) as TaskStatus[]
}
