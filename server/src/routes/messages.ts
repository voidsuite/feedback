/**
 * /api/threads/:id/messages — the live chat on a thread (and support sessions).
 * Messages broadcast over WebSocket and trigger notifications.
 */

import { Hono } from "hono"
import { getSessionUser, isAdmin } from "../lib/auth.js"
import { getThread, addMessage, deleteMessage, getThreadMeta, getThreadAuthorEmail } from "../lib/threads.js"
import { notify, notifyAuthor } from "../lib/notify.js"
import { broadcastToThread, broadcastToAdmins, broadcastToSupport } from "../lib/events.js"

const messages = new Hono()

// GET /api/threads/:id/messages — visible only to author / admin / public thread
messages.get("/:id/messages", async (c) => {
  const user = await getSessionUser(c)
  const thread = getThread(c.req.param("id"), user ? { id: user.id, isAdmin: isAdmin(user) } : undefined)
  if (!thread) return c.json({ error: "Not found" }, 404)
  return c.json({ messages: thread.messages })
})

// POST /api/threads/:id/messages — post a message
messages.post("/:id/messages", async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.json({ error: "Not authenticated" }, 401)
  const id = c.req.param("id")
  const thread = getThread(id, { id: user.id, isAdmin: isAdmin(user) })
  if (!thread) return c.json({ error: "Not found" }, 404)

  const body = await c.req.json().catch(() => null)
  const text = typeof body?.body === "string" ? body.body.trim() : ""
  if (!text) return c.json({ error: "Message is required" }, 400)

  const admin = isAdmin(user)
  const isInternal = admin && body?.isInternal === true
  const message = addMessage({
    threadId: id,
    author: user,
    authorRole: admin ? "admin" : "user",
    bodyMarkdown: text,
    isInternal,
  })

  // For display: admin messages in non-internal threads show as "Void Team"
  // unless they explicitly choose to comment as themselves
  const requestedName = typeof body?.displayName === "string" ? body.displayName.trim() : ""
  const displayName = admin && !isInternal
    ? (requestedName === "self" ? user.name : "Void Team")
    : user.name
  const displayMessage = { ...message, author: { ...message.author, name: displayName } }

  // Internal notes go only to admins; everything else goes to the thread room
  // (and the support lobby for support chats) so users never receive admin-only notes.
  if (isInternal) {
    broadcastToAdmins({ type: "message", threadId: id, message: displayMessage })
  } else {
    broadcastToThread(id, { type: "message", threadId: id, message: displayMessage })
    if (thread.type === "support") broadcastToSupport({ type: "support_message", threadId: id, message: displayMessage })
    broadcastToAdmins({ type: "inbox_update" })
  }

  // Notifications: admins on any reply; the author when an admin replies.
  const meta = getThreadMeta(id)!
  const ctx = {
    thread: { id: meta.id, type: meta.type, title: meta.title, source_app: meta.source_app, status: meta.status, author_name: meta.author_name },
    message: { body: text, author_name: displayName, author_role: admin ? "admin" : "user" },
    actor: { name: user.name },
    author_email: getThreadAuthorEmail(id) ?? undefined,
  }
  if (!isInternal) {
    await notify("new_reply", ctx)
    if (admin) await notifyAuthor("new_reply", ctx)
  }

  return c.json({ message: displayMessage }, 201)
})

// DELETE /api/threads/:id/messages/:messageId — delete a message
messages.delete("/:id/messages/:messageId", async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.json({ error: "Not authenticated" }, 401)
  const threadId = c.req.param("id")
  const messageId = c.req.param("messageId")
  const thread = getThread(threadId, { id: user.id, isAdmin: isAdmin(user) })
  if (!thread) return c.json({ error: "Not found" }, 404)

  const msg = thread.messages.find((m) => m.id === messageId)
  if (!msg) return c.json({ error: "Message not found" }, 404)

  const admin = isAdmin(user)
  const isOwn = msg.author.id === user.id
  if (!admin && !isOwn) return c.json({ error: "Forbidden" }, 403)

  const deleted = deleteMessage(messageId, threadId)
  if (!deleted) return c.json({ error: "Delete failed" }, 400)

  broadcastToThread(threadId, { type: "message_deleted", threadId, messageId })
  if (thread.type === "support") broadcastToSupport({ type: "support_message_deleted", threadId, messageId })
  broadcastToAdmins({ type: "inbox_update" })
  return c.json({ ok: true })
})

export default messages
