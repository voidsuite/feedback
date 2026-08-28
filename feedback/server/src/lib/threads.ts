/**
 * Feedback thread + message + vote data access and serializers.
 * The gateway speaks plain JSON DTOs to the client.
 *
 * Visibility: a thread is visible to its author, any admin, and (if is_public)
 * anyone (the public roadmap). Support chats are private to author + admins.
 */

import { db, now } from "../db/connection.js"
import { newId } from "./ids.js"
import type { SessionUser } from "../db/sessions.js"

export type ThreadType = "question" | "feature" | "bug" | "support"
export type ThreadStatus = "open" | "in_review" | "planned" | "in_progress" | "answered" | "shipped" | "closed"
export type ThreadPriority = "low" | "medium" | "high" | "urgent"

export interface ThreadAuthor {
  id: string
  name: string
  picture: string | null
}

export interface MessageDto {
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
  messages: MessageDto[]
}

interface ThreadRow {
  id: string
  type: string
  source_app: string | null
  title: string
  body_markdown: string
  status: string
  priority: string
  is_public: number
  author_id: string
  author_name: string
  author_picture: string | null
  assignee_id: string | null
  assignee_name: string | null
  assignee_picture: string | null
  created_at: number
  updated_at: number
  messageCount: number
  voteCount: number
  adminReplies: number
  hasVoted: number
}

interface Viewer {
  id: string
  isAdmin: boolean
}

function baseSelect(viewerId?: string): string {
  return `
    SELECT t.id, t.type, t.source_app, t.title, t.body_markdown, t.status, t.priority, t.is_public,
           t.author_id, t.created_at, t.updated_at,
           u.name AS author_name, u.picture AS author_picture,
           a.id AS assignee_id, a.name AS assignee_name, a.picture AS assignee_picture,
           (SELECT COUNT(*) FROM feedback_messages m WHERE m.thread_id = t.id) AS messageCount,
           (SELECT COUNT(*) FROM feedback_votes v WHERE v.thread_id = t.id) AS voteCount,
           (SELECT COUNT(*) FROM feedback_messages m WHERE m.thread_id = t.id AND m.author_role = 'admin') AS adminReplies
           ${viewerId ? `, (SELECT COUNT(*) FROM feedback_votes v WHERE v.thread_id = t.id AND v.user_id = '${viewerId.replace(/'/g, "''")}') AS hasVoted` : ", 0 AS hasVoted"}
    FROM feedback_threads t
    JOIN users u ON u.id = t.author_id
    LEFT JOIN users a ON a.id = t.assignee_id
  `
}

function rowToSummary(row: ThreadRow): ThreadSummary {
  return {
    id: row.id,
    type: row.type as ThreadType,
    sourceApp: row.source_app,
    title: row.title,
    status: row.status as ThreadStatus,
    priority: row.priority as ThreadPriority,
    isPublic: row.is_public === 1,
    author: { id: row.author_id, name: row.author_name, picture: row.author_picture },
    assignee: row.assignee_id ? { id: row.assignee_id, name: row.assignee_name!, picture: row.assignee_picture } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.messageCount,
    voteCount: row.voteCount,
    adminReplies: row.adminReplies,
    hasVoted: row.hasVoted > 0,
    unanswered: row.adminReplies === 0,
  }
}

export interface ListFilters {
  type?: string
  status?: string
  sourceApp?: string
  assignee?: string
  author?: string
  unanswered?: boolean
  mine?: boolean
  publicOnly?: boolean
  q?: string
  sort?: "recent" | "top" | "active"
  limit?: number
  offset?: number
}

export function listThreads(filters: ListFilters, viewer?: Viewer): { threads: ThreadSummary[]; total: number } {
  const where: string[] = []
  const params: any[] = []
  if (filters.type) { where.push("t.type = ?"); params.push(filters.type) }
  if (filters.status) { where.push("t.status = ?"); params.push(filters.status) }
  if (filters.sourceApp) { where.push("t.source_app = ?"); params.push(filters.sourceApp) }
  if (filters.assignee) { where.push("t.assignee_id = ?"); params.push(filters.assignee) }
  if (filters.author) { where.push("t.author_id = ?"); params.push(filters.author) }
  if (filters.mine && viewer) { where.push("t.author_id = ?"); params.push(viewer.id) }
  if (filters.publicOnly) { where.push("t.is_public = 1") }
  if (filters.unanswered) { where.push("(SELECT COUNT(*) FROM feedback_messages m WHERE m.thread_id = t.id AND m.author_role = 'admin') = 0") }
  if (filters.q) { where.push("(t.title LIKE ? OR t.body_markdown LIKE ?)"); params.push(`%${filters.q}%`, `%${filters.q}%`) }

  // Visibility: admins see everything; signed-in users see their own + public;
  // anonymous users see only public.
  if (viewer && viewer.isAdmin) {
    /* no restriction */
  } else if (viewer) {
    where.push("(t.author_id = ? OR t.is_public = 1)")
    params.push(viewer.id)
  } else {
    where.push("t.is_public = 1")
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""
  const total = (db.query(`SELECT COUNT(*) AS n FROM feedback_threads t ${whereSql}`).get(...params) as { n: number }).n

  const orderSql =
    filters.sort === "top"
      ? "ORDER BY voteCount DESC, t.updated_at DESC"
      : filters.sort === "active"
        ? "ORDER BY t.updated_at DESC"
        : "ORDER BY t.created_at DESC"

  const limit = Math.min(filters.limit ?? 50, 200)
  const offset = filters.offset ?? 0

  const rows = db.query(`${baseSelect(viewer?.id)} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`).all(...params, limit, offset) as ThreadRow[]
  return { threads: rows.map(rowToSummary), total }
}

const threadRowStmt = db.query(baseSelect(undefined) + " WHERE t.id = ?")

export function getThread(id: string, viewer?: Viewer): ThreadDetail | null {
  const row = (viewer
    ? db.query(baseSelect(viewer.id) + " WHERE t.id = ?").get(id)
    : threadRowStmt.get(id)) as ThreadRow | null
  if (!row) return null
  // Visibility gate.
  if (!(viewer?.isAdmin) && !row.is_public && viewer?.id !== row.author_id) return null
  const messages = listMessages(id, viewer?.isAdmin ?? false)
  return { ...rowToSummary(row), bodyMarkdown: row.body_markdown, messages }
}

export function createThread(input: {
  type: ThreadType
  sourceApp?: string | null
  author: SessionUser
  title: string
  bodyMarkdown: string
  priority: ThreadPriority
}): ThreadDetail {
  const id = newId("fb")
  const ts = now()
  db.query(
    `INSERT INTO feedback_threads (id, type, source_app, author_id, title, body_markdown, status, priority, is_public, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, 0, ?, ?)`
  ).run(id, input.type, input.sourceApp ?? null, input.author.id, input.title, input.bodyMarkdown, input.priority, ts, ts)
  addMessage({ threadId: id, author: input.author, authorRole: "user", bodyMarkdown: input.bodyMarkdown, isInternal: false })
  return getThread(id, { id: input.author.id, isAdmin: false })!
}

export function updateThread(
  id: string,
  patch: Partial<{ title: string; bodyMarkdown: string; status: ThreadStatus; priority: ThreadPriority; assigneeId: string | null; isPublic: boolean }>
): ThreadDetail | null {
  const sets: string[] = []
  const params: any[] = []
  if (patch.title !== undefined) { sets.push("title = ?"); params.push(patch.title) }
  if (patch.bodyMarkdown !== undefined) { sets.push("body_markdown = ?"); params.push(patch.bodyMarkdown) }
  if (patch.status !== undefined) { sets.push("status = ?"); params.push(patch.status) }
  if (patch.priority !== undefined) { sets.push("priority = ?"); params.push(patch.priority) }
  if (patch.assigneeId !== undefined) { sets.push("assignee_id = ?"); params.push(patch.assigneeId) }
  if (patch.isPublic !== undefined) { sets.push("is_public = ?"); params.push(patch.isPublic ? 1 : 0) }
  if (sets.length === 0) return getThread(id)
  sets.push("updated_at = ?")
  params.push(now())
  db.query(`UPDATE feedback_threads SET ${sets.join(", ")} WHERE id = ?`).run(...params, id)
  return { ...getThread(id)!, bodyMarkdown: getThread(id)!.bodyMarkdown }
}

export function deleteThread(id: string): void {
  db.query("DELETE FROM feedback_threads WHERE id = ?").run(id)
}

export function listMessages(threadId: string, includeInternal: boolean): MessageDto[] {
  const raw = db.query(
    includeInternal
      ? `SELECT m.id, m.thread_id AS threadId, m.author_role AS authorRole, m.body_markdown AS bodyMarkdown,
                m.is_internal AS isInternal, m.created_at AS createdAt,
                u.id AS authorId, u.name AS authorName, u.picture AS authorPicture
         FROM feedback_messages m JOIN users u ON u.id = m.author_id
         WHERE m.thread_id = ? ORDER BY m.created_at ASC`
      : `SELECT m.id, m.thread_id AS threadId, m.author_role AS authorRole, m.body_markdown AS bodyMarkdown,
                m.is_internal AS isInternal, m.created_at AS createdAt,
                u.id AS authorId, u.name AS authorName, u.picture AS authorPicture
         FROM feedback_messages m JOIN users u ON u.id = m.author_id
         WHERE m.thread_id = ? AND m.is_internal = 0 ORDER BY m.created_at ASC`
  ).all(threadId) as {
    id: string; threadId: string; authorRole: string; bodyMarkdown: string; isInternal: number; createdAt: number
    authorId: string; authorName: string; authorPicture: string | null
  }[]
  return raw.map((r) => ({
    id: r.id,
    threadId: r.threadId,
    author: { id: r.authorId, name: r.authorName, picture: r.authorPicture },
    authorRole: r.authorRole as MessageDto["authorRole"],
    bodyMarkdown: r.bodyMarkdown,
    isInternal: r.isInternal === 1,
    createdAt: r.createdAt,
  }))
}

export function addMessage(input: {
  threadId: string
  author: SessionUser
  authorRole: "user" | "admin" | "system"
  bodyMarkdown: string
  isInternal: boolean
}): MessageDto {
  const id = newId("fm")
  db.query(
    `INSERT INTO feedback_messages (id, thread_id, author_id, author_role, body_markdown, is_internal, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.threadId, input.author.id, input.authorRole, input.bodyMarkdown, input.isInternal ? 1 : 0, now())
  db.query("UPDATE feedback_threads SET updated_at = ? WHERE id = ?").run(now(), input.threadId)
  return listMessages(input.threadId, true).find((m) => m.id === id)!
}

export function getMessage(id: string): MessageDto | null {
  const r = db.query(`
    SELECT m.id, m.thread_id AS threadId, m.author_role AS authorRole, m.body_markdown AS bodyMarkdown,
           m.is_internal AS isInternal, m.created_at AS createdAt,
           u.id AS authorId, u.name AS authorName, u.picture AS authorPicture
    FROM feedback_messages m JOIN users u ON u.id = m.author_id WHERE m.id = ?
  `).get(id) as {
    id: string; threadId: string; authorRole: string; bodyMarkdown: string; isInternal: number; createdAt: number
    authorId: string; authorName: string; authorPicture: string | null
  } | null
  if (!r) return null
  return {
    id: r.id, threadId: r.threadId, author: { id: r.authorId, name: r.authorName, picture: r.authorPicture },
    authorRole: r.authorRole as MessageDto["authorRole"], bodyMarkdown: r.bodyMarkdown, isInternal: r.isInternal === 1, createdAt: r.createdAt,
  }
}

export function vote(threadId: string, userId: string): { voted: boolean; votes: number } {
  const existing = db.query("SELECT 1 FROM feedback_votes WHERE thread_id = ? AND user_id = ?").get(threadId, userId)
  if (!existing) db.query("INSERT INTO feedback_votes (thread_id, user_id, created_at) VALUES (?, ?, ?)").run(threadId, userId, now())
  const votes = (db.query("SELECT COUNT(*) AS n FROM feedback_votes WHERE thread_id = ?").get(threadId) as { n: number }).n
  return { voted: !existing, votes }
}

export function unvote(threadId: string, userId: string): { voted: boolean; votes: number } {
  db.query("DELETE FROM feedback_votes WHERE thread_id = ? AND user_id = ?").run(threadId, userId)
  const votes = (db.query("SELECT COUNT(*) AS n FROM feedback_votes WHERE thread_id = ?").get(threadId) as { n: number }).n
  return { voted: false, votes }
}

export function getThreadAuthorEmail(threadId: string): string | null {
  const row = db.query("SELECT u.email FROM feedback_threads t JOIN users u ON u.id = t.author_id WHERE t.id = ?").get(threadId) as { email: string } | null
  return row?.email ?? null
}

export function getThreadMeta(threadId: string): { id: string; type: ThreadType; title: string; source_app: string | null; status: ThreadStatus; author_name: string } | null {
  const row = db.query("SELECT t.id, t.type, t.title, t.source_app, t.status, u.name AS author_name FROM feedback_threads t JOIN users u ON u.id = t.author_id WHERE t.id = ?").get(threadId) as {
    id: string; type: string; title: string; source_app: string | null; status: string; author_name: string
  } | null
  if (!row) return null
  return { id: row.id, type: row.type as ThreadType, title: row.title, source_app: row.source_app, status: row.status as ThreadStatus, author_name: row.author_name }
}
