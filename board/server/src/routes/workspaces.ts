/**
 * /api/workspaces, /api/projects, /api/boards, /api/join — account-scoped
 * CRUD. Everything here requires membership (or, for join, a token).
 */

import { Hono } from "hono"
import { db, now } from "../db/connection.js"
import { newId, generateInviteToken } from "../lib/ids.js"
import { authRequired, getAuthUser } from "../middleware/auth.js"
import { broadcastToWorkspace } from "../lib/events.js"
import {
  boardWorkspace, listBoards, listProjects, serializeBoard, serializeProject,
  serializeWorkspace, workspaceRole,
} from "../lib/dto.js"

const routes = new Hono()
routes.use("*", authRequired)

// --- Workspaces ---

const listForUserStmt = db.query(`
  SELECT w.id FROM workspaces w
  JOIN workspace_members wm ON wm.workspace_id = w.id
  WHERE wm.user_id = ? ORDER BY w.updated_at DESC
`)

routes.get("/workspaces", (c) => {
  const { user } = getAuthUser(c)!
  const rows = listForUserStmt.all(user.id) as { id: string }[]
  const workspaces = rows.map((r) => serializeWorkspace(r.id)).filter(Boolean)
  return c.json(workspaces)
})

routes.post("/workspaces", (c) => c.req.json().then(async (body) => {
  const { user } = getAuthUser(c)!
  const name = String(body?.name || "").trim().slice(0, 100)
  if (!name) return c.json({ error: "Name is required" }, 400)

  const id = newId("ws")
  const t = now()
  db.transaction(() => {
    db.query("INSERT INTO workspaces (id, name, owner_id, invite_token, invite_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)")
      .run(id, name, user.id, generateInviteToken(), t, t)
    db.query("INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)")
      .run(id, user.id, t)
  })()
  return c.json(serializeWorkspace(id), 201)
}))

routes.get("/workspaces/:id", (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  if (!workspaceRole(id, user.id)) return c.json({ error: "Not a member" }, 403)
  const ws = serializeWorkspace(id)
  if (!ws) return c.json({ error: "Not found" }, 404)
  return c.json(ws)
})

routes.get("/workspaces/:id/projects", (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  if (!workspaceRole(id, user.id)) return c.json({ error: "Not a member" }, 403)
  return c.json(listProjects(id))
})

routes.get("/workspaces/:id/boards", (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  if (!workspaceRole(id, user.id)) return c.json({ error: "Not a member" }, 403)
  return c.json(listBoards(id))
})

routes.patch("/workspaces/:id", (c) => c.req.json().then(async (body) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const role = workspaceRole(id, user.id)
  if (!role) return c.json({ error: "Not a member" }, 403)

  const patch: string[] = []
  const values: (string | number | null)[] = []
  if (typeof body?.name === "string" && body.name.trim()) {
    patch.push("name = ?")
    values.push(body.name.trim().slice(0, 100))
  }
  if (typeof body?.avatarFileId === "string") {
    const file = db.query("SELECT id FROM files WHERE id = ? AND workspace_id = ?").get(body.avatarFileId, id)
    if (!file) return c.json({ error: "Avatar file isn't in this workspace" }, 400)
    patch.push("avatar_file_id = ?")
    values.push(body.avatarFileId)
  } else if (body?.avatarFileId === null) {
    patch.push("avatar_file_id = NULL")
  }
  if (!patch.length) return c.json(serializeWorkspace(id))
  values.push(now(), id)
  db.query(`UPDATE workspaces SET ${patch.join(", ")}, updated_at = ? WHERE id = ?`).run(...values)
  broadcastToWorkspace(id, { type: "workspace.upsert", workspaceId: id, actorId: user.id })
  return c.json(serializeWorkspace(id))
}))

routes.delete("/workspaces/:id", (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  if (workspaceRole(id, user.id) !== "owner") return c.json({ error: "Only the owner can delete" }, 403)
  db.query("DELETE FROM workspaces WHERE id = ?").run(id)
  return c.json({ ok: true })
})

// --- Membership ---

routes.patch("/workspaces/:id/members/:userId", (c) => c.req.json().then(async (body) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const targetId = c.req.param("userId")
  const role = workspaceRole(id, user.id)
  if (!role) return c.json({ error: "Not a member" }, 403)
  if (!["owner", "admin"].includes(role)) return c.json({ error: "Admins only" }, 403)

  const next = body?.role
  if (!["admin", "member"].includes(next)) return c.json({ error: "Invalid role" }, 400)
  if (targetId === user.id) return c.json({ error: "Cannot change your own role" }, 400)

  db.query("UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?").run(next, id, targetId)
  broadcastToWorkspace(id, { type: "workspace.member", workspaceId: id, actorId: user.id })
  return c.json(serializeWorkspace(id))
}))

routes.delete("/workspaces/:id/members/:userId", (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const targetId = c.req.param("userId")
  const role = workspaceRole(id, user.id)
  if (!role) return c.json({ error: "Not a member" }, 403)
  if (!["owner", "admin"].includes(role)) return c.json({ error: "Admins only" }, 403)
  if (targetId === user.id) return c.json({ error: "Cannot remove yourself" }, 400)
  if (targetId === serializeWorkspace(id)?.ownerId) return c.json({ error: "Cannot remove the owner" }, 400)

  db.query("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?").run(id, targetId)
  broadcastToWorkspace(id, { type: "workspace.member", workspaceId: id, actorId: user.id })
  return c.json(serializeWorkspace(id))
})

// --- Invite / join ---

routes.post("/workspaces/:id/invite", (c) => c.req.json().then(async (body) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const role = workspaceRole(id, user.id)
  if (!role) return c.json({ error: "Not a member" }, 403)
  if (!["owner", "admin"].includes(role)) return c.json({ error: "Admins only" }, 403)

  const enabled = body?.enabled !== false
  const token = enabled ? generateInviteToken() : null
  db.query("UPDATE workspaces SET invite_token = ?, invite_enabled = ?, updated_at = ? WHERE id = ?")
    .run(token, enabled ? 1 : 0, now(), id)
  return c.json(serializeWorkspace(id))
}))

routes.post("/join/:token", async (c) => {
  const { user } = getAuthUser(c)!
  const token = c.req.param("token")
  const row = db.query("SELECT id FROM workspaces WHERE invite_token = ? AND invite_enabled = 1").get(token) as { id: string } | null
  if (!row) return c.json({ error: "Invalid or disabled invite" }, 404)

  db.query("INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)")
    .run(row.id, user.id, now())
  broadcastToWorkspace(row.id, { type: "workspace.member", workspaceId: row.id, actorId: user.id })
  return c.json(serializeWorkspace(row.id))
})

// --- Projects ---

routes.post("/projects", async (c) => {
  const { user } = getAuthUser(c)!
  const body = await c.req.json().catch(() => null)
  const ws = String(body?.workspaceId || "")
  const name = String(body?.name || "").trim().slice(0, 100)
  if (!workspaceRole(ws, user.id)) return c.json({ error: "Not a member" }, 403)
  if (!name) return c.json({ error: "Name is required" }, 400)

  const id = newId("prj")
  const t = now()
  const count = db.query("SELECT COUNT(*) AS n FROM projects WHERE workspace_id = ?").get(ws) as { n: number }
  db.query("INSERT INTO projects (id, workspace_id, name, color, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, ws, name, "#a8a29e", count.n, t, t)
  broadcastToWorkspace(ws, { type: "project.upsert", projectId: id, actorId: user.id })
  return c.json(serializeProject(id), 201)
})

routes.patch("/projects/:id", (c) => c.req.json().then(async (body) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const proj = serializeProject(id)
  if (!proj) return c.json({ error: "Not found" }, 404)
  if (!workspaceRole(proj.workspaceId, user.id)) return c.json({ error: "Not a member" }, 403)

  const patch: string[] = []
  const values: (string | number)[] = []
  if (typeof body?.name === "string" && body.name.trim()) {
    patch.push("name = ?")
    values.push(body.name.trim().slice(0, 100))
  }
  if (typeof body?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)) {
    patch.push("color = ?")
    values.push(body.color)
  }
  if (patch.length) {
    values.push(now(), id)
    db.query(`UPDATE projects SET ${patch.join(", ")}, updated_at = ? WHERE id = ?`).run(...values)
    broadcastToWorkspace(proj.workspaceId, { type: "project.upsert", projectId: id, actorId: user.id })
  }
  return c.json(serializeProject(id))
}))

routes.delete("/projects/:id", (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const proj = serializeProject(id)
  if (!proj) return c.json({ error: "Not found" }, 404)
  if (!workspaceRole(proj.workspaceId, user.id)) return c.json({ error: "Not a member" }, 403)
  db.query("DELETE FROM projects WHERE id = ?").run(id)
  broadcastToWorkspace(proj.workspaceId, { type: "project.delete", projectId: id, actorId: user.id })
  return c.json({ ok: true })
})

// --- Boards ---

routes.post("/boards", async (c) => {
  const { user } = getAuthUser(c)!
  const body = await c.req.json().catch(() => null) as { workspaceId?: string; name?: string; projectId?: string | null }
  const ws = String(body?.workspaceId || "")
  const name = String(body?.name || "").trim().slice(0, 100)
  if (!workspaceRole(ws, user.id)) return c.json({ error: "Not a member" }, 403)
  if (!name) return c.json({ error: "Name is required" }, 400)

  let projectId: string | null = body?.projectId ?? null
  if (projectId) {
    const proj = serializeProject(projectId)
    if (!proj || proj.workspaceId !== ws) projectId = null
  }

  const id = newId("brd")
  const t = now()
  const count = db.query("SELECT COUNT(*) AS n FROM boards WHERE workspace_id = ?").get(ws) as { n: number }
  db.query("INSERT INTO boards (id, workspace_id, project_id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, ws, projectId, name, count.n, t, t)
  broadcastToWorkspace(ws, { type: "board.upsert", boardId: id, actorId: user.id })
  return c.json(serializeBoard(id), 201)
})

routes.patch("/boards/:id", (c) => c.req.json().then(async (body) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const ws = boardWorkspace(id, user.id)
  if (!ws) return c.json({ error: "Not found" }, 404)

  const patch: string[] = []
  const values: (string | number | null)[] = []
  if (typeof body?.name === "string" && body.name.trim()) {
    patch.push("name = ?")
    values.push(body.name.trim().slice(0, 100))
  }
  if (typeof body?.avatarFileId === "string") {
    const file = db.query("SELECT id FROM files WHERE id = ? AND workspace_id = ?").get(body.avatarFileId, ws)
    if (!file) return c.json({ error: "Avatar file isn't in this workspace" }, 400)
    patch.push("avatar_file_id = ?")
    values.push(body.avatarFileId)
  } else if (body?.avatarFileId === null) {
    patch.push("avatar_file_id = NULL")
  }
  if (!patch.length) return c.json(serializeBoard(id))
  values.push(now(), id)
  db.query(`UPDATE boards SET ${patch.join(", ")}, updated_at = ? WHERE id = ?`).run(...values)
  broadcastToWorkspace(ws, { type: "board.upsert", boardId: id, actorId: user.id })
  return c.json(serializeBoard(id))
}))

routes.delete("/boards/:id", (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const ws = boardWorkspace(id, user.id)
  if (!ws) return c.json({ error: "Not found" }, 404)
  db.query("DELETE FROM boards WHERE id = ?").run(id)
  broadcastToWorkspace(ws, { type: "board.delete", boardId: id, actorId: user.id })
  return c.json({ ok: true })
})

routes.post("/boards/:id/columns/order", async (c) => {
  const { user } = getAuthUser(c)!
  const boardId = c.req.param("id")
  const ws = boardWorkspace(boardId, user.id)
  if (!ws) return c.json({ error: "Not found" }, 404)
  const body = await c.req.json().catch(() => null)
  const orderedIds: string[] = Array.isArray(body?.orderedIds) ? (body.orderedIds as string[]).map(String) : []
  if (!orderedIds.length) return c.json({ error: "Empty order" }, 400)

  const existing = db.query("SELECT id FROM columns WHERE board_id = ?").all(boardId) as { id: string }[]
  const known = new Set(existing.map((r) => r.id))
  const valid = orderedIds.filter((id) => known.has(id))
  db.transaction(() => {
    const stmt = db.query("UPDATE columns SET position = ? WHERE id = ?")
    valid.forEach((id, i) => stmt.run(i, id))
  })()
  return c.json({ ok: true })
})

export default routes