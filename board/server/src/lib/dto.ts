/**
 * Serializers + access checks. The gateway speaks plain JSON DTOs to the
 * client; these helpers shape SQL rows into the document the UI renders.
 */

import { db } from "../db/connection.js"
import type { SessionUser } from "../db/sessions.js"
import { newId } from "./ids.js"

export type { SessionUser }

// --- Access ---

const memberRoleStmt = db.query("SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
const boardWorkspaceStmt = db.query("SELECT workspace_id FROM boards WHERE id = ?")

/** Returns the caller's role in a workspace, or null if not a member. */
export function workspaceRole(workspaceId: string, userId: string): "owner" | "admin" | "member" | null {
  const row = memberRoleStmt.get(workspaceId, userId) as { role: string } | null
  return (row?.role as "owner" | "admin" | "member") ?? null
}

/** Returns the workspace a board belongs to if the user may access it. */
export function boardWorkspace(boardId: string, userId: string): string | null {
  const row = boardWorkspaceStmt.get(boardId) as { workspace_id: string } | null
  if (!row) return null
  if (!workspaceRole(row.workspace_id, userId)) return null
  return row.workspace_id
}

// --- Workspace ---

const memberRowsStmt = db.query(`
  SELECT wm.user_id AS userId, wm.role, wm.joined_at AS joinedAt,
         u.name, u.email, u.picture
  FROM workspace_members wm JOIN users u ON u.id = wm.user_id
  WHERE wm.workspace_id = ?
  ORDER BY wm.joined_at ASC
`)

const workspaceRowStmt = db.query(`
  SELECT id, name, avatar_file_id AS avatarFileId, owner_id AS ownerId, invite_token AS inviteToken,
         invite_enabled AS inviteEnabled, created_at AS createdAt, updated_at AS updatedAt
  FROM workspaces WHERE id = ?
`)

export interface WorkspaceDto {
  id: string
  name: string
  avatarFileId: string | null
  ownerId: string
  inviteToken: string | null
  inviteEnabled: boolean
  members: {
    userId: string
    name: string
    email: string
    picture?: string | null
    role: "owner" | "admin" | "member"
    joinedAt: number
  }[]
  createdAt: number
  updatedAt: number
}

export function serializeWorkspace(id: string): WorkspaceDto | null {
  const row = workspaceRowStmt.get(id) as {
    id: string
    name: string
    avatarFileId: string | null
    ownerId: string
    inviteToken: string | null
    inviteEnabled: number
    createdAt: number
    updatedAt: number
  } | null
  if (!row) return null
  const members = (memberRowsStmt.all(id) as {
    userId: string
    role: string
    joinedAt: number
    name: string
    email: string
    picture: string | null
  }[]).map((m) => ({
    userId: m.userId,
    name: m.name,
    email: m.email,
    picture: m.picture,
    role: m.role as "owner" | "admin" | "member",
    joinedAt: m.joinedAt,
  }))
  return {
    id: row.id,
    name: row.name,
    avatarFileId: row.avatarFileId,
    ownerId: row.ownerId,
    inviteToken: row.inviteToken,
    inviteEnabled: row.inviteEnabled === 1,
    members,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// --- Projects / boards (list shapes) ---

const projectsStmt = db.query(`
  SELECT id, workspace_id AS workspaceId, name, color, position,
         created_at AS createdAt, updated_at AS updatedAt
  FROM projects WHERE workspace_id = ? ORDER BY position ASC, created_at ASC
`)

const boardsStmt = db.query(`
  SELECT id, workspace_id AS workspaceId, project_id AS projectId, name, position,
         avatar_file_id AS avatarFileId,
         created_at AS createdAt, updated_at AS updatedAt
  FROM boards WHERE workspace_id = ? ORDER BY position ASC, created_at ASC
`)

export interface ProjectDto {
  id: string
  workspaceId: string
  name: string
  color: string
  position: number
  createdAt: number
  updatedAt: number
}

export interface BoardDto {
  id: string
  workspaceId: string
  projectId: string | null
  name: string
  avatarFileId: string | null
  position: number
  createdAt: number
  updatedAt: number
}

export function listProjects(workspaceId: string): ProjectDto[] {
  return projectsStmt.all(workspaceId) as unknown as ProjectDto[]
}

export function listBoards(workspaceId: string): BoardDto[] {
  const rows = boardsStmt.all(workspaceId) as {
    id: string
    workspaceId: string
    projectId: string | null
    name: string
    avatarFileId: string | null
    position: number
    createdAt: number
    updatedAt: number
  }[]
  return rows
}

export function serializeProject(id: string): ProjectDto | null {
  const row = db.query(`
    SELECT id, workspace_id AS workspaceId, name, color, position,
           created_at AS createdAt, updated_at AS updatedAt
    FROM projects WHERE id = ?
  `).get(id) as ProjectDto | null
  return row ?? null
}

export function serializeBoard(id: string): BoardDto | null {
  const row = db.query(`
    SELECT id, workspace_id AS workspaceId, project_id AS projectId, name, position,
           avatar_file_id AS avatarFileId,
           created_at AS createdAt, updated_at AS updatedAt
    FROM boards WHERE id = ?
  `).get(id) as {
    id: string
    workspaceId: string
    projectId: string | null
    name: string
    avatarFileId: string | null
    position: number
    createdAt: number
    updatedAt: number
  } | null
  return row ?? null
}

// --- Items (full shape) ---

const itemRowStmt = db.query(`
  SELECT i.id, i.board_id AS boardId, i.column_id AS columnId, i.title,
         i.description, i.priority, i.due_date AS dueDate, i.position,
         i.cover_file_id AS coverFileId, i.created_by AS createdBy,
         i.updated_by AS updatedBy, i.created_at AS createdAt, i.updated_at AS updatedAt,
         cu.name AS createdByName, cu.picture AS createdByPicture,
         uu.name AS updatedByName, uu.picture AS updatedByPicture
  FROM items i
  JOIN users cu ON cu.id = i.created_by
  JOIN users uu ON uu.id = i.updated_by
  WHERE i.id = ?
`)

const itemLabelsStmt = db.query(`
  SELECT l.id, l.board_id AS boardId, l.name, l.color, l.position
  FROM labels l JOIN item_labels il ON il.label_id = l.id
  WHERE il.item_id = ? ORDER BY l.position ASC
`)

const itemAssigneesStmt = db.query(`
  SELECT u.id, u.name, u.picture
  FROM users u JOIN item_assignees ia ON ia.user_id = u.id
  WHERE ia.item_id = ? ORDER BY u.name ASC
`)

const itemChecklistStmt = db.query(`
  SELECT id, text, done, position FROM checklist_items
  WHERE item_id = ? ORDER BY position ASC
`)

const itemCommentsStmt = db.query(`
  SELECT cm.id, cm.item_id AS itemId, cm.parent_id AS parentId, cm.body, cm.created_at AS createdAt, cm.updated_at AS updatedAt,
         u.id AS authorId, u.name AS authorName, u.picture AS authorPicture
  FROM comments cm JOIN users u ON u.id = cm.author_id
  WHERE cm.item_id = ? ORDER BY cm.created_at ASC
`)

const itemActivityStmt = db.query(`
  SELECT ac.id, ac.item_id AS itemId, ac.action, ac.data_json AS dataJson,
         ac.created_at AS createdAt, u.id AS actorId, u.name AS actorName, u.picture AS actorPicture
  FROM item_activity ac JOIN users u ON u.id = ac.actor_id
  WHERE ac.item_id = ? ORDER BY ac.created_at DESC LIMIT 50
`)

const attachmentCountStmt = db.query(`
  SELECT COUNT(*) AS n FROM files f JOIN items i ON i.cover_file_id = f.id WHERE i.id = ?
`)

export interface ItemDto {
  id: string
  boardId: string
  columnId: string
  title: string
  description: string
  priority: string
  dueDate: number | null
  position: number
  coverFileId: string | null
  createdBy: { id: string; name: string; picture?: string | null }
  updatedBy: { id: string; name: string; picture?: string | null }
  createdAt: number
  updatedAt: number
  labels: { id: string; boardId: string; name: string; color: string; position: number }[]
  assignees: { id: string; name: string; picture?: string | null }[]
  checklists: { id: string; text: string; done: boolean; position: number }[]
  comments: {
    id: string
    itemId: string
    parentId: string | null
    body: string
    author: { id: string; name: string; picture?: string | null }
    createdAt: number
    updatedAt: number
  }[]
  activity: {
    id: string
    itemId: string
    action: string
    data: Record<string, unknown>
    actor: { id: string; name: string; picture?: string | null }
    createdAt: number
  }[]
  attachmentCount: number
}

export function serializeItem(id: string): ItemDto | null {
  const row = itemRowStmt.get(id) as {
    id: string
    boardId: string
    columnId: string
    title: string
    description: string
    priority: string
    dueDate: number | null
    position: number
    coverFileId: string | null
    createdBy: string
    updatedBy: string
    createdAt: number
    updatedAt: number
    createdByName: string
    createdByPicture: string | null
    updatedByName: string
    updatedByPicture: string | null
  } | null
  if (!row) return null

  const labels = (itemLabelsStmt.all(id) as { id: string; boardId: string; name: string; color: string; position: number }[])
  const assignees = (itemAssigneesStmt.all(id) as { id: string; name: string; picture: string | null }[]).map((a) => ({
    id: a.id,
    name: a.name,
    picture: a.picture,
  }))
  const checklists = (itemChecklistStmt.all(id) as { id: string; text: string; done: number; position: number }[]).map((c) => ({
    id: c.id,
    text: c.text,
    done: c.done === 1,
    position: c.position,
  }))
  const comments = (itemCommentsStmt.all(id) as {
    id: string
    itemId: string
    parentId: string | null
    body: string
    createdAt: number
    updatedAt: number
    authorId: string
    authorName: string
    authorPicture: string | null
  }[]).map((cm) => ({
    id: cm.id,
    itemId: cm.itemId,
    parentId: cm.parentId,
    body: cm.body,
    author: { id: cm.authorId, name: cm.authorName, picture: cm.authorPicture },
    createdAt: cm.createdAt,
    updatedAt: cm.updatedAt,
  }))
  const activity = (itemActivityStmt.all(id) as {
    id: string
    itemId: string
    action: string
    dataJson: string
    createdAt: number
    actorId: string
    actorName: string
    actorPicture: string | null
  }[]).map((ac) => ({
    id: ac.id,
    itemId: ac.itemId,
    action: ac.action,
    data: JSON.parse(ac.dataJson || "{}") as Record<string, unknown>,
    actor: { id: ac.actorId, name: ac.actorName, picture: ac.actorPicture },
    createdAt: ac.createdAt,
  }))
  const { n } = attachmentCountStmt.get(id) as { n: number }

  return {
    id: row.id,
    boardId: row.boardId,
    columnId: row.columnId,
    title: row.title,
    description: row.description,
    priority: row.priority,
    dueDate: row.dueDate,
    position: row.position,
    coverFileId: row.coverFileId,
    createdBy: { id: row.createdBy, name: row.createdByName, picture: row.createdByPicture },
    updatedBy: { id: row.updatedBy, name: row.updatedByName, picture: row.updatedByPicture },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    labels,
    assignees,
    checklists,
    comments,
    activity,
    attachmentCount: n,
  }
}

// --- Activity logging ---

const insertActivityStmt = db.query(`
  INSERT INTO item_activity (id, item_id, actor_id, action, data_json, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)

export function logActivity(itemId: string, actorId: string, action: string, data: Record<string, unknown> = {}): void {
  insertActivityStmt.run(newId("act"), itemId, actorId, action, JSON.stringify(data), Date.now())
}

export function toUserSummary(user: SessionUser): { id: string; name: string; picture?: string | null } {
  return { id: user.id, name: user.name, picture: user.picture }
}