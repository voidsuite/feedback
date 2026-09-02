export type ThreadType = "question" | "feature" | "bug" | "support"
export type ThreadStatus =
  | "open"
  | "in_review"
  | "planned"
  | "in_progress"
  | "answered"
  | "shipped"
  | "closed"
export type ThreadPriority = "low" | "medium" | "high" | "urgent"

export interface ThreadAuthor {
  id: string
  name: string
  picture: string | null
  role?: string
}

export interface Message {
  id: string
  threadId: string
  author: ThreadAuthor
  authorRole: "user" | "admin" | "system"
  bodyMarkdown: string
  isInternal: boolean
  createdAt: number
}

export interface ThreadSummary {
  id: string
  type: ThreadType
  sourceApp: string | null
  title: string
  status: ThreadStatus
  priority: ThreadPriority
  isPublic: boolean
  author: ThreadAuthor
  assignee: ThreadAuthor | null
  createdAt: number
  updatedAt: number
  messageCount: number
  voteCount: number
  adminReplies: number
  hasVoted: boolean
  unanswered: boolean
}

export interface ThreadDetail extends ThreadSummary {
  bodyMarkdown: string
  messages: Message[]
}

export interface SourceStat {
  source: string
  slug: string | null
  count: number
  questions: number
  features: number
  bugs: number
  support: number
}

export type NotifyTargetType = "discord" | "slack" | "telegram" | "email" | "webhook"
export type NotifyEvent = "new_feedback" | "new_reply" | "status_change" | "assigned" | "priority_change"

export interface NotifyTarget {
  id: string
  type: NotifyTargetType
  name: string
  config: Record<string, unknown>
  enabled: boolean
  events: NotifyEvent[]
  createdAt: number
}

export interface AdminStats {
  total: number
  open: number
  unanswered: number
  assigned: number
  publicCount: number
  users: number
  byType: Record<string, number>
  byStatus: Record<string, number>
}

export const TYPE_LABEL: Record<ThreadType, string> = {
  question: "Question",
  feature: "Feature request",
  bug: "Bug report",
  support: "Support",
}

export const STATUS_LABEL: Record<ThreadStatus, string> = {
  open: "Open",
  in_review: "In review",
  planned: "Planned",
  in_progress: "In progress",
  answered: "Answered",
  shipped: "Shipped",
  closed: "Closed",
}

export const PRIORITY_LABEL: Record<ThreadPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
}
