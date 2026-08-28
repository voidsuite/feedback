/** Client-side models for VoidBoard — mirror of the gateway's DTOs. */

export interface User {
  id: string
  name: string
  email: string
  picture?: string | null
}

export type UserSummary = Pick<User, "id" | "name" | "picture">

export type MemberRole = "owner" | "admin" | "member"

export interface WorkspaceMember {
  userId: string
  name: string
  email: string
  picture?: string | null
  role: MemberRole
  joinedAt: number
}

export interface Workspace {
  id: string
  name: string
  /** Avatar file id (uploaded via /api/files) — null = initials tile. */
  avatarFileId: string | null
  ownerId: string
  /** Rotatable share token — anyone with /join/<token> becomes a member. */
  inviteToken: string | null
  inviteEnabled: boolean
  members: WorkspaceMember[]
  createdAt: number
  updatedAt: number
}

export interface Project {
  id: string
  workspaceId: string
  name: string
  color: string
  position: number
  createdAt: number
  updatedAt: number
}

export interface Board {
  id: string
  workspaceId: string
  projectId: string | null
  name: string
  /** Avatar file id (uploaded via /api/files) — null = initials tile. */
  avatarFileId: string | null
  position: number
  createdAt: number
  updatedAt: number
}

export interface Column {
  id: string
  boardId: string
  name: string
  position: number
  wipLimit: number | null
  createdAt: number
}

export type ItemPriority = "none" | "low" | "medium" | "high" | "urgent"

export const PRIORITIES: ItemPriority[] = ["none", "low", "medium", "high", "urgent"]

export interface Label {
  id: string
  boardId: string
  name: string
  color: string
  position: number
}

export interface ChecklistEntry {
  id: string
  text: string
  done: boolean
  position: number
}

export interface Comment {
  id: string
  itemId: string
  /** null = top-level comment; otherwise the comment this is a reply to. */
  parentId: string | null
  author: UserSummary
  body: string
  createdAt: number
  updatedAt: number
}

export interface ActivityEvent {
  id: string
  itemId: string
  actor: UserSummary
  action: string
  data: Record<string, unknown>
  createdAt: number
}

export interface Item {
  id: string
  boardId: string
  columnId: string
  title: string
  description: string
  priority: ItemPriority
  dueDate: number | null
  position: number
  coverFileId: string | null
  createdBy: UserSummary
  updatedBy: UserSummary
  createdAt: number
  updatedAt: number
  labels: Label[]
  assignees: UserSummary[]
  checklists: ChecklistEntry[]
  comments: Comment[]
  activity: ActivityEvent[]
  attachmentCount: number
}

/** Full document for one board — what the board page hydrates from. */
export interface BoardDocument {
  board: Board
  columns: Column[]
  items: Item[]
  workspace: Workspace
}

export interface FileMeta {
  id: string
  name: string
  mime: string
  size: number
  createdAt: number
}

/** Presence pushed over the realtime socket. */
export interface PresenceMember {
  userId: string
  name: string
  picture?: string | null
  boardId: string
}

export interface WsEvent {
  type: string
  boardId: string
  actorId?: string
  [key: string]: unknown
}