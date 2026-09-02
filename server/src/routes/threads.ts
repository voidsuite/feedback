/**
 * /api/threads — feedback submissions (questions / features / bugs / support).
 * Visibility is enforced in the data layer; admins see everything.
 */

import { Hono } from "hono"
import { getSessionUser, isAdmin } from "../lib/auth.js"
import {
  listThreads,
  getThread,
  createThread,
  updateThread,
  deleteThread,
  getThreadMeta,
  getThreadAuthorEmail,
  addSystemMessage,
  type ThreadType,
  type ThreadPriority,
  type ThreadStatus,
} from "../lib/threads.js"
import { notify, notifyAuthor, type NotifyEvent } from "../lib/notify.js"
import { broadcastToThread, broadcastToAdmins, broadcastToSupport } from "../lib/events.js"

const VALID_TYPES: ThreadType[] = ["question", "feature", "bug", "support"]
const VALID_PRIORITIES: ThreadPriority[] = ["low", "medium", "high", "urgent"]
const VALID_STATUSES: ThreadStatus[] = ["open", "in_review", "planned", "in_progress", "answered", "shipped", "closed"]

const threads = new Hono()

// GET /api/threads — list (admins see all; users see own + public; anon sees public only)
threads.get("/", async (c) => {
  const user = await getSessionUser(c)
  const q = c.req.query()
  const filters = {
    type: q.type,
    status: q.status,
    sourceApp: q.sourceApp,
    assignee: q.assignee,
    author: q.author,
    unanswered: q.unanswered === "1",
    mine: q.mine === "1",
    publicOnly: q.publicOnly === "1",
    q: q.q,
    sort: (q.sort as "recent" | "top" | "active") || "recent",
    limit: q.limit ? (parseInt(q.limit, 10) || 50) : 50,
    offset: q.offset ? (parseInt(q.offset, 10) || 0) : 0,
  }
  const { threads: list, total } = listThreads(filters, user ? { id: user.id, isAdmin: isAdmin(user) } : undefined)
  return c.json({ threads: list, total })
})

// POST /api/threads — create
threads.post("/", async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.json({ error: "Not authenticated" }, 401)
  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ error: "Invalid body" }, 400)

  const type = body.type as ThreadType
  if (!VALID_TYPES.includes(type)) return c.json({ error: "Invalid type" }, 400)
  const priority = (body.priority as ThreadPriority) || "medium"
  if (!VALID_PRIORITIES.includes(priority)) return c.json({ error: "Invalid priority" }, 400)

  let title = typeof body.title === "string" ? body.title.trim() : ""
  if (!title && type === "support") title = `Support · ${user.name}`
  if (!title) return c.json({ error: "Title is required" }, 400)

  const bodyMarkdown = typeof body.bodyMarkdown === "string" ? body.bodyMarkdown : typeof body.body === "string" ? body.body : ""
  const sourceApp = typeof body.sourceApp === "string" && body.sourceApp ? body.sourceApp.slice(0, 64) : null

  const thread = createThread({ type, sourceApp, author: user, title, bodyMarkdown, priority })

  const meta = getThreadMeta(thread.id)!
  await notify("new_feedback", { thread: { id: meta.id, type: meta.type, title: meta.title, source_app: meta.source_app, status: meta.status, author_name: meta.author_name } })
  if (type === "support") broadcastToSupport({ type: "support_new", thread })
  broadcastToAdmins({ type: "inbox_update" })

  return c.json({ thread }, 201)
})

// GET /api/threads/:id — detail (internal notes only for admins)
threads.get("/:id", async (c) => {
  const user = await getSessionUser(c)
  const thread = getThread(c.req.param("id"), user ? { id: user.id, isAdmin: isAdmin(user) } : undefined)
  if (!thread) return c.json({ error: "Not found" }, 404)
  return c.json({ thread })
})

// PATCH /api/threads/:id — update
threads.patch("/:id", async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.json({ error: "Not authenticated" }, 401)
  const id = c.req.param("id")
  const existing = getThread(id, { id: user.id, isAdmin: isAdmin(user) })
  if (!existing) return c.json({ error: "Not found" }, 404)
  const admin = isAdmin(user)
  const isAuthor = existing.author.id === user.id
  if (!admin && !isAuthor) return c.json({ error: "Forbidden" }, 403)

  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ error: "Invalid body" }, 400)

  const patch: Parameters<typeof updateThread>[1] = {}
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 200)
  if (typeof body.bodyMarkdown === "string") patch.bodyMarkdown = body.bodyMarkdown
  if (typeof body.type === "string" && VALID_TYPES.includes(body.type)) patch.type = body.type
  if (typeof body.priority === "string" && VALID_PRIORITIES.includes(body.priority)) patch.priority = body.priority
  if (admin) {
    if (body.status && VALID_STATUSES.includes(body.status)) patch.status = body.status
    if ("assigneeId" in body) patch.assigneeId = body.assigneeId ? String(body.assigneeId) : null
    if (typeof body.isPublic === "boolean") patch.isPublic = body.isPublic
  }

  const updated = updateThread(id, patch)
  if (!updated) return c.json({ error: "Update failed" }, 400)

  // Notifications for status / assignment / priority changes.
  const meta = getThreadMeta(id)!
  const ctx = {
    thread: { id: meta.id, type: meta.type, title: meta.title, source_app: meta.source_app, status: meta.status, priority: updated?.priority, author_name: meta.author_name },
    actor: { name: user.name },
    author_email: getThreadAuthorEmail(id) ?? undefined,
  }
  if (patch.status && patch.status !== existing.status) {
    const STATUS_LABEL: Record<string, string> = { open: "Open", in_review: "In review", planned: "Planned", in_progress: "In progress", answered: "Answered", shipped: "Shipped", closed: "Closed" }
    addSystemMessage(id, `Status changed from **${STATUS_LABEL[existing.status] || existing.status}** to **${STATUS_LABEL[patch.status] || patch.status}** by ${user.name}`)
    await notify("status_change", ctx)
    await notifyAuthor("status_change", ctx)
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== (existing.assignee?.id ?? null)) {
    const assigneeName = patch.assigneeId ? user.name : "nobody"
    addSystemMessage(id, patch.assigneeId ? `Assigned to **${user.name}**` : `Unassigned by ${user.name}`)
    await notify("assigned", ctx)
  }
  if (patch.priority && patch.priority !== existing.priority) {
    const PRIORITY_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" }
    addSystemMessage(id, `Priority changed from **${PRIORITY_LABEL[existing.priority] || existing.priority}** to **${PRIORITY_LABEL[patch.priority] || patch.priority}** by ${user.name}`)
    await notify("priority_change", ctx)
    await notifyAuthor("priority_change", ctx)
  }
  if (patch.type && patch.type !== existing.type) {
    const TYPE_LABEL: Record<string, string> = { question: "Question", feature: "Feature request", bug: "Bug report", support: "Support" }
    addSystemMessage(id, `Type changed from **${TYPE_LABEL[existing.type] || existing.type}** to **${TYPE_LABEL[patch.type] || patch.type}** by ${user.name}`)
  }

  broadcastToThread(id, { type: "thread_update", thread: updated })
  broadcastToAdmins({ type: "inbox_update" })
  return c.json({ thread: updated })
})

// DELETE /api/threads/:id
threads.delete("/:id", async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.json({ error: "Not authenticated" }, 401)
  const id = c.req.param("id")
  const existing = getThread(id, { id: user.id, isAdmin: isAdmin(user) })
  if (!existing) return c.json({ error: "Not found" }, 404)
  if (!isAdmin(user) && existing.author.id !== user.id) return c.json({ error: "Forbidden" }, 403)
  deleteThread(id)
  broadcastToAdmins({ type: "inbox_update" })
  return c.json({ ok: true })
})

export default threads
