/**
 * /api/threads/:id/messages — the live chat on a thread (and support sessions).
 * Messages broadcast over WebSocket and trigger notifications.
 */

import { Hono } from "hono"
import { getSessionUser, isAdmin } from "../lib/auth.js"
import { getThread, addMessage, getThreadMeta, getThreadAuthorEmail } from "../lib/threads.js"
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

  // Internal notes go only to admins; everything else goes to the thread room
  // (and the support lobby for support chats) so users never receive admin-only notes.
  if (isInternal) {
    broadcastToAdmins({ type: "message", threadId: id, message })
  } else {
    broadcastToThread(id, { type: "message", threadId: id, message })
    if (thread.type === "support") broadcastToSupport({ type: "support_message", threadId: id, message })
    broadcastToAdmins({ type: "inbox_update" })
  }

  // Notifications: admins on any reply; the author when an admin replies.
  const meta = getThreadMeta(id)!
  const ctx = {
    thread: { id: meta.id, type: meta.type, title: meta.title, source_app: meta.source_app, status: meta.status, author_name: meta.author_name },
    message: { body: text, author_name: user.name, author_role: admin ? "admin" : "user" },
    actor: { name: user.name },
    author_email: getThreadAuthorEmail(id) ?? undefined,
  }
  if (!isInternal) {
    await notify("new_reply", ctx)
    if (admin) await notifyAuthor("new_reply", ctx)
  }

  return c.json({ message }, 201)
})

export default messages
