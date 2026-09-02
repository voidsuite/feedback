/**
 * /api/admin/* — admin-only analytics + source breakdown.
 * Every route here is gated by requireAdmin (role from VoidAuth).
 */

import { Hono } from "hono"
import { getSessionUser, isAdmin } from "../lib/auth.js"
import { db } from "../db/connection.js"

const admin = new Hono()

admin.use("*", async (c, next) => {
  const user = await getSessionUser(c)
  if (!user) return c.json({ error: "Not authenticated" }, 401)
  if (!isAdmin(user)) return c.json({ error: "Forbidden" }, 403)
  await next()
})

// GET /api/admin/stats
admin.get("/stats", async (c) => {
  const total = (db.query("SELECT COUNT(*) AS n FROM feedback_threads").get() as { n: number }).n
  const byType = db.query("SELECT type, COUNT(*) AS n FROM feedback_threads GROUP BY type").all() as { type: string; n: number }[]
  const byStatus = db.query("SELECT status, COUNT(*) AS n FROM feedback_threads GROUP BY status").all() as { status: string; n: number }[]
  const open = (db.query("SELECT COUNT(*) AS n FROM feedback_threads WHERE status = 'open'").get() as { n: number }).n
  const unanswered = (db.query("SELECT COUNT(*) AS n FROM feedback_threads t WHERE (SELECT COUNT(*) FROM feedback_messages m WHERE m.thread_id = t.id AND m.author_role = 'admin') = 0").get() as { n: number }).n
  const assigned = (db.query("SELECT COUNT(*) AS n FROM feedback_threads WHERE assignee_id IS NOT NULL").get() as { n: number }).n
  const publicCount = (db.query("SELECT COUNT(*) AS n FROM feedback_threads WHERE is_public = 1").get() as { n: number }).n
  const users = (db.query("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n

  const byTypeMap: Record<string, number> = {}
  for (const r of byType) byTypeMap[r.type] = r.n
  const byStatusMap: Record<string, number> = {}
  for (const r of byStatus) byStatusMap[r.status] = r.n

  return c.json({ total, open, unanswered, assigned, publicCount, users, byType: byTypeMap, byStatus: byStatusMap })
})

// GET /api/admin/sources — feedback volume per originating app (?source=)
admin.get("/sources", async (c) => {
  const rows = db.query(`
    SELECT COALESCE(source_app, '') AS source_app, COUNT(*) AS count,
           SUM(CASE WHEN type = 'question' THEN 1 ELSE 0 END) AS questions,
           SUM(CASE WHEN type = 'feature' THEN 1 ELSE 0 END) AS features,
           SUM(CASE WHEN type = 'bug' THEN 1 ELSE 0 END) AS bugs,
           SUM(CASE WHEN type = 'support' THEN 1 ELSE 0 END) AS support
    FROM feedback_threads
    GROUP BY source_app
    ORDER BY count DESC
  `).all() as {
    source_app: string; count: number; questions: number; features: number; bugs: number; support: number
  }[]
  const sources = rows.map((r) => ({
    source: r.source_app || "(direct)",
    slug: r.source_app,
    count: r.count,
    questions: r.questions,
    features: r.features,
    bugs: r.bugs,
    support: r.support,
  }))
  return c.json({ sources })
})

export default admin
