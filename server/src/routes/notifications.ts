/**
 * /api/admin/notifications/* — manage notification targets (Discord, Slack,
 * Telegram, Email, Generic Webhook) and which events each fires on.
 */

import { Hono } from "hono"
import { getSessionUser, isAdmin } from "../lib/auth.js"
import { db, now } from "../db/connection.js"
import { newId } from "../lib/ids.js"
import { testTarget } from "../lib/notify.js"

const notifications = new Hono()

notifications.use("*", async (c, next) => {
  const user = await getSessionUser(c)
  if (!user) return c.json({ error: "Not authenticated" }, 401)
  if (!isAdmin(user)) return c.json({ error: "Forbidden" }, 403)
  await next()
})

const TYPES = ["discord", "slack", "telegram", "email", "webhook"]
const ALL_EVENTS = ["new_feedback", "new_reply", "status_change", "assigned"]

function rowToTarget(r: any) {
  let config = {}
  let events: string[] = ALL_EVENTS
  try { config = JSON.parse(r.config || "{}") } catch { /* */ }
  try { events = JSON.parse(r.events || "[]") } catch { /* */ }
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    config,
    enabled: r.enabled === 1,
    events,
    createdAt: r.created_at,
  }
}

// GET /api/admin/notifications/targets
notifications.get("/targets", async (c) => {
  const rows = db.query("SELECT id, type, name, config, enabled, events, created_at FROM notification_targets ORDER BY created_at ASC").all() as any[]
  return c.json({ targets: rows.map(rowToTarget) })
})

// POST /api/admin/notifications/targets
notifications.post("/targets", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ error: "Invalid body" }, 400)
  if (!TYPES.includes(body.type)) return c.json({ error: "Invalid type" }, 400)
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : body.type
  const config = typeof body.config === "object" && body.config ? body.config : {}
  let events: string[] = Array.isArray(body.events) ? body.events.filter((e: string) => ALL_EVENTS.includes(e)) : ALL_EVENTS
  if (events.length === 0) events = ALL_EVENTS
  const enabled = body.enabled !== false

  const id = newId("nt")
  db.query(
    "INSERT INTO notification_targets (id, type, name, config, enabled, events, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, body.type, name, JSON.stringify(config), enabled ? 1 : 0, JSON.stringify(events), now())
  const row = db.query("SELECT id, type, name, config, enabled, events, created_at FROM notification_targets WHERE id = ?").get(id) as any
  return c.json({ target: rowToTarget(row) }, 201)
})

// PATCH /api/admin/notifications/targets/:id
notifications.patch("/targets/:id", async (c) => {
  const id = c.req.param("id")
  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ error: "Invalid body" }, 400)
  const existing = db.query("SELECT id FROM notification_targets WHERE id = ?").get(id) as { id: string } | null
  if (!existing) return c.json({ error: "Not found" }, 404)

  const sets: string[] = []
  const params: any[] = []
  if (typeof body.name === "string") { sets.push("name = ?"); params.push(body.name.slice(0, 80)) }
  if (typeof body.config === "object" && body.config) { sets.push("config = ?"); params.push(JSON.stringify(body.config)) }
  if (Array.isArray(body.events)) { sets.push("events = ?"); params.push(JSON.stringify(body.events.filter((e: string) => ALL_EVENTS.includes(e)))) }
  if (typeof body.enabled === "boolean") { sets.push("enabled = ?"); params.push(body.enabled ? 1 : 0) }
  if (sets.length === 0) return c.json({ error: "Nothing to update" }, 400)
  db.query(`UPDATE notification_targets SET ${sets.join(", ")} WHERE id = ?`).run(...params, id)
  const row = db.query("SELECT id, type, name, config, enabled, events, created_at FROM notification_targets WHERE id = ?").get(id) as any
  return c.json({ target: rowToTarget(row) })
})

// DELETE /api/admin/notifications/targets/:id
notifications.delete("/targets/:id", async (c) => {
  db.query("DELETE FROM notification_targets WHERE id = ?").run(c.req.param("id"))
  return c.json({ ok: true })
})

// POST /api/admin/notifications/test/:id — send a test notification
notifications.post("/test/:id", async (c) => {
  const result = await testTarget(c.req.param("id"))
  return c.json(result)
})

export default notifications
