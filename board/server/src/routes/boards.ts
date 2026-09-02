/**
 * /api/boards/:id/document, /api/columns, /api/items, /api/labels,
 * /api/items/:id/(labels|assignees|comments|checklist) — board-scoped CRUD.
 * Mutations broadcast server-authoritative events to the board room.
 */

import { Hono } from "hono"
import { db, now } from "../db/connection.js"
import { newId } from "../lib/ids.js"
import { authRequired, getAuthUser } from "../middleware/auth.js"
import { broadcastToBoard, broadcastToWorkspace } from "../lib/events.js"
import {
  boardWorkspace, logActivity, serializeBoard, serializeItem, serializeWorkspace,
  listProjects, workspaceRole,
} from "../lib/dto.js"

const routes = new Hono()
routes.use("*", authRequired)

// --- Board document (full hydrate for the board page) ---

routes.get("/boards/:id/document", (c) => {
  const { user } = getAuthUser(c)!
  const boardId = c.req.param("id")
  const ws = boardWorkspace(boardId, user.id)
  if (!ws) return c.json({ error: "Not found" }, 404)

  const board = serializeBoard(boardId)
  const workspace = serializeWorkspace(ws)!
  const columns = db.query(`
    SELECT id, board_id AS boardId, name, position, wip_limit AS wipLimit, created_at AS createdAt
    FROM columns WHERE board_id = ? ORDER BY position ASC
  `).all(boardId) as { id: string; boardId: string; name: string; position: number; wipLimit: number | null; createdAt: number }[]

  const itemRows = db.query("SELECT id FROM items WHERE board_id = ? ORDER BY position ASC").all(boardId) as { id: string }[]
  const items = itemRows.map((r) => serializeItem(r.id)).filter(Boolean)

  return c.json({ board, columns, items, workspace })
})

// --- Columns ---

routes.post("/columns", async (c) => {
  const { user } = getAuthUser(c)!
  const body = await c.req.json().catch(() => null)
  const boardId = String(body?.boardId || "")
  const name = String(body?.name || "").trim().slice(0, 100)
  const ws = boardWorkspace(boardId, user.id)
  if (!ws) return c.json({ error: "Not found" }, 404)
  if (!name) return c.json({ error: "Name is required" }, 400)

  const id = newId("col")
  const count = db.query("SELECT COUNT(*) AS n FROM columns WHERE board_id = ?").get(boardId) as { n: number }
  const t = now()
  db.query("INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, boardId, name, count.n, t)
  const column = { id, boardId, name, position: count.n, wipLimit: null, createdAt: t }
  broadcastToBoard(boardId, { type: "column.upsert", boardId, column, actorId: user.id })
  return c.json(column, 201)
})

routes.patch("/columns/:id", async (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const row = db.query("SELECT id, board_id AS boardId FROM columns WHERE id = ?").get(id) as { id: string; boardId: string } | null
  if (!row) return c.json({ error: "Not found" }, 404)
  if (!boardWorkspace(row.boardId, user.id)) return c.json({ error: "Forbidden" }, 403)
  const body = await c.req.json().catch(() => null)

  const patch: string[] = []
  const values: (string | number | null)[] = []
  if (typeof body?.name === "string" && body.name.trim()) {
    patch.push("name = ?")
    values.push(body.name.trim().slice(0, 100))
  }
  if (body?.wipLimit === null || typeof body?.wipLimit === "number") {
    const wip = body.wipLimit
    if (wip === null || (Number.isInteger(wip) && wip >= 0)) {
      patch.push("wip_limit = ?")
      values.push(wip === null ? null : wip)
    }
  }
  if (patch.length) {
    values.push(id)
    db.query(`UPDATE columns SET ${patch.join(", ")} WHERE id = ?`).run(...values)
  }
  const column = db.query(`
    SELECT id, board_id AS boardId, name, position, wip_limit AS wipLimit, created_at AS createdAt
    FROM columns WHERE id = ?
  `).get(id)
  broadcastToBoard(row.boardId, { type: "column.upsert", boardId: row.boardId, column, actorId: user.id })
  return c.json(column)
})

routes.delete("/columns/:id", (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const row = db.query("SELECT id, board_id AS boardId FROM columns WHERE id = ?").get(id) as { id: string; boardId: string } | null
  if (!row) return c.json({ error: "Not found" }, 404)
  if (!boardWorkspace(row.boardId, user.id)) return c.json({ error: "Forbidden" }, 403)

  db.transaction(() => {
    // Archive items in the column: delete them (cards are not restored in v1).
    const items = db.query("SELECT id FROM items WHERE column_id = ?").all(id) as { id: string }[]
    for (const item of items) db.query("DELETE FROM items WHERE id = ?").run(item.id)
    db.query("DELETE FROM columns WHERE id = ?").run(id)
  })()
  broadcastToBoard(row.boardId, { type: "column.delete", boardId: row.boardId, columnId: id, actorId: user.id })
  return c.json({ ok: true })
})

// --- Items ---

const PRIORITIES = new Set(["none", "low", "medium", "high", "urgent"])

routes.post("/items", async (c) => {
  const { user } = getAuthUser(c)!
  const body = await c.req.json().catch(() => null)
  const boardId = String(body?.boardId || "")
  const columnId = String(body?.columnId || "")
  const title = String(body?.title || "").trim().slice(0, 500)
  if (!boardWorkspace(boardId, user.id)) return c.json({ error: "Not found" }, 404)
  const col = db.query("SELECT id FROM columns WHERE id = ? AND board_id = ?").get(columnId, boardId)
  if (!col) return c.json({ error: "Column not found" }, 400)
  if (!title) return c.json({ error: "Title is required" }, 400)

  const id = newId("itm")
  const t = now()
  const count = db.query("SELECT COUNT(*) AS n FROM items WHERE column_id = ?").get(columnId) as { n: number }
  db.query(`
    INSERT INTO items (id, board_id, column_id, title, description, priority, due_date, position, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, '', 'none', NULL, ?, ?, ?, ?, ?)
  `).run(id, boardId, columnId, title, count.n, user.id, user.id, t, t)
  logActivity(id, user.id, "created", { title })
  const item = serializeItem(id)!
  broadcastToBoard(boardId, { type: "item.upsert", boardId, item, actorId: user.id })
  return c.json(item, 201)
})

routes.patch("/items/:id", async (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const row = db.query("SELECT id, board_id AS boardId, column_id AS columnId FROM items WHERE id = ?").get(id) as
    { id: string; boardId: string; columnId: string } | null
  if (!row) return c.json({ error: "Not found" }, 404)
  if (!boardWorkspace(row.boardId, user.id)) return c.json({ error: "Forbidden" }, 403)
  const body = await c.req.json().catch(() => null)

  const isMove = body?.columnId !== undefined || body?.position !== undefined

  if (isMove) {
    const targetColumnId = String(body.columnId ?? row.columnId)
    const col = db.query("SELECT id FROM columns WHERE id = ? AND board_id = ?").get(targetColumnId, row.boardId)
    if (!col) return c.json({ error: "Column not found" }, 400)

    let finalIndex = 0
    db.transaction(() => {
      const targetItems = (db.query("SELECT id FROM items WHERE column_id = ? ORDER BY position ASC").all(targetColumnId) as { id: string }[])
        .map((r) => r.id)
        .filter((i) => i !== id)
      let index = Number.isInteger(body.position) ? (body.position as number) : targetItems.length
      index = Math.max(0, Math.min(index, targetItems.length))
      targetItems.splice(index, 0, id)
      finalIndex = index

      const stmt = db.query("UPDATE items SET column_id = ?, position = ?, updated_by = ?, updated_at = ? WHERE id = ?")
      targetItems.forEach((itemId, i) => stmt.run(targetColumnId, i, user.id, now(), itemId))
    })()
    logActivity(id, user.id, "moved", { toColumn: targetColumnId, toIndex: finalIndex })
  } else {
    const patch: string[] = []
    const values: (string | number | null)[] = []
    let changed: string[] = []

    if (typeof body?.title === "string" && body.title.trim()) {
      patch.push("title = ?")
      values.push(body.title.trim().slice(0, 500))
      changed.push("title")
    }
    if (typeof body?.description === "string") {
      patch.push("description = ?")
      values.push(body.description)
      changed.push("description")
    }
    if (typeof body?.priority === "string" && PRIORITIES.has(body.priority)) {
      patch.push("priority = ?")
      values.push(body.priority)
      changed.push("priority")
    }
    if (body?.dueDate === null || typeof body?.dueDate === "number") {
      patch.push("due_date = ?")
      values.push(body.dueDate as number | null)
      changed.push("dueDate")
    }
    if (body?.coverFileId === null || typeof body?.coverFileId === "string") {
      patch.push("cover_file_id = ?")
      values.push(body.coverFileId as string | null)
      changed.push("cover")
    }
    if (!patch.length) return c.json(serializeItem(id))

    values.push(user.id, now(), id)
    db.query(`UPDATE items SET ${patch.join(", ")}, updated_by = ?, updated_at = ? WHERE id = ?`).run(...values)
    if (changed.length) logActivity(id, user.id, "updated", { fields: changed })
  }

  const item = serializeItem(id)!
  broadcastToBoard(row.boardId, { type: "item.upsert", boardId: row.boardId, item, actorId: user.id })
  return c.json(item)
})

routes.delete("/items/:id", (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const row = db.query("SELECT id, board_id AS boardId FROM items WHERE id = ?").get(id) as { id: string; boardId: string } | null
  if (!row) return c.json({ error: "Not found" }, 404)
  if (!boardWorkspace(row.boardId, user.id)) return c.json({ error: "Forbidden" }, 403)
  db.query("DELETE FROM items WHERE id = ?").run(id)
  broadcastToBoard(row.boardId, { type: "item.delete", boardId: row.boardId, itemId: id, actorId: user.id })
  return c.json({ ok: true })
})

// --- Labels ---

routes.post("/labels", async (c) => {
  const { user } = getAuthUser(c)!
  const body = await c.req.json().catch(() => null)
  const boardId = String(body?.boardId || "")
  const name = String(body?.name || "").trim().slice(0, 50)
  const color = /^#[0-9a-fA-F]{6}$/.test(String(body?.color || "")) ? String(body.color) : "#a8a29e"
  if (!boardWorkspace(boardId, user.id)) return c.json({ error: "Not found" }, 404)
  if (!name) return c.json({ error: "Name is required" }, 400)

  const id = newId("lbl")
  const count = db.query("SELECT COUNT(*) AS n FROM labels WHERE board_id = ?").get(boardId) as { n: number }
  db.query("INSERT INTO labels (id, board_id, name, color, position) VALUES (?, ?, ?, ?, ?)")
    .run(id, boardId, name, color, count.n)
  const label = { id, boardId, name, color, position: count.n }
  broadcastToBoard(boardId, { type: "label.upsert", boardId, label, actorId: user.id })
  return c.json(label, 201)
})

routes.patch("/labels/:id", async (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const row = db.query("SELECT id, board_id AS boardId FROM labels WHERE id = ?").get(id) as { id: string; boardId: string } | null
  if (!row) return c.json({ error: "Not found" }, 404)
  if (!boardWorkspace(row.boardId, user.id)) return c.json({ error: "Forbidden" }, 403)
  const body = await c.req.json().catch(() => null)

  const patch: string[] = []
  const values: string[] = []
  if (typeof body?.name === "string" && body.name.trim()) {
    patch.push("name = ?")
    values.push(body.name.trim().slice(0, 50))
  }
  if (/^#[0-9a-fA-F]{6}$/.test(String(body?.color || ""))) {
    patch.push("color = ?")
    values.push(String(body.color))
  }
  if (patch.length) db.query(`UPDATE labels SET ${patch.join(", ")} WHERE id = ?`).run(...values, id)
  const label = db.query("SELECT id, board_id AS boardId, name, color, position FROM labels WHERE id = ?").get(id)
  broadcastToBoard(row.boardId, { type: "label.upsert", boardId: row.boardId, label, actorId: user.id })
  return c.json(label)
})

routes.delete("/labels/:id", (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const row = db.query("SELECT id, board_id AS boardId FROM labels WHERE id = ?").get(id) as { id: string; boardId: string } | null
  if (!row) return c.json({ error: "Not found" }, 404)
  if (!boardWorkspace(row.boardId, user.id)) return c.json({ error: "Forbidden" }, 403)
  db.transaction(() => {
    // Remove the association from every card, then drop the label itself.
    db.query("DELETE FROM item_labels WHERE label_id = ?").run(id)
    db.query("DELETE FROM labels WHERE id = ?").run(id)
  })()
  broadcastToBoard(row.boardId, { type: "label.delete", boardId: row.boardId, labelId: id, actorId: user.id })
  return c.json({ ok: true })
})

// --- Item associations (labels, assignees), comments, checklist ---

routes.put("/items/:id/labels", async (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const row = db.query("SELECT id, board_id AS boardId FROM items WHERE id = ?").get(id) as { id: string; boardId: string } | null
  if (!row) return c.json({ error: "Not found" }, 404)
  if (!boardWorkspace(row.boardId, user.id)) return c.json({ error: "Forbidden" }, 403)
  const body = await c.req.json().catch(() => null)
  const labelIds: string[] = Array.isArray(body?.labelIds) ? (body.labelIds as string[]).map(String) : []

  // Only labels that belong to the same board.
  const valid = (db.query("SELECT id FROM labels WHERE board_id = ?").all(row.boardId) as { id: string }[]).map((r) => r.id)
  const keep = labelIds.filter((l) => valid.includes(l))

  db.transaction(() => {
    db.query("DELETE FROM item_labels WHERE item_id = ?").run(id)
    const stmt = db.query("INSERT OR IGNORE INTO item_labels (item_id, label_id) VALUES (?, ?)")
    for (const l of keep) stmt.run(id, l)
    db.query("UPDATE items SET updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now(), id)
  })()
  logActivity(id, user.id, "labels", { count: keep.length })
  const item = serializeItem(id)!
  broadcastToBoard(row.boardId, { type: "item.upsert", boardId: row.boardId, item, actorId: user.id })
  return c.json(item)
})

routes.put("/items/:id/assignees", async (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const row = db.query("SELECT id, board_id AS boardId FROM items WHERE id = ?").get(id) as { id: string; boardId: string } | null
  if (!row) return c.json({ error: "Not found" }, 404)
  const ws = boardWorkspace(row.boardId, user.id)
  if (!ws) return c.json({ error: "Forbidden" }, 403)
  const body = await c.req.json().catch(() => null)
  const userIds: string[] = Array.isArray(body?.userIds) ? (body.userIds as string[]).map(String) : []

  // Assignees must be workspace members.
  const members = db.query("SELECT user_id AS userId FROM workspace_members WHERE workspace_id = ?").all(ws) as { userId: string }[]
  const valid = new Set(members.map((m) => m.userId))
  const keep = userIds.filter((u) => valid.has(u))

  db.transaction(() => {
    db.query("DELETE FROM item_assignees WHERE item_id = ?").run(id)
    const stmt = db.query("INSERT OR IGNORE INTO item_assignees (item_id, user_id) VALUES (?, ?)")
    for (const u of keep) stmt.run(id, u)
    db.query("UPDATE items SET updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now(), id)
  })()
  logActivity(id, user.id, "assignees", { count: keep.length })
  const item = serializeItem(id)!
  broadcastToBoard(row.boardId, { type: "item.upsert", boardId: row.boardId, item, actorId: user.id })
  return c.json(item)
})

routes.post("/items/:id/comments", async (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const row = db.query("SELECT id, board_id AS boardId FROM items WHERE id = ?").get(id) as { id: string; boardId: string } | null
  if (!row) return c.json({ error: "Not found" }, 404)
  if (!boardWorkspace(row.boardId, user.id)) return c.json({ error: "Forbidden" }, 403)
  const body = await c.req.json().catch(() => null)
  const text = String(body?.body || "").trim().slice(0, 5000)
  if (!text) return c.json({ error: "Comment is empty" }, 400)

  // Replies nest under an existing comment on the same card.
  const parentId = body?.parentId ? String(body.parentId) : null
  if (parentId) {
    const parent = db.query("SELECT id, item_id AS itemId FROM comments WHERE id = ?").get(parentId) as { id: string; itemId: string } | null
    if (!parent || parent.itemId !== id) return c.json({ error: "Parent comment not found" }, 400)
  }

  const commentId = newId("cmt")
  const t = now()
  db.transaction(() => {
    db.query("INSERT INTO comments (id, item_id, author_id, parent_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(commentId, id, user.id, parentId, text, t, t)
    db.query("UPDATE items SET updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now(), id)
  })()
  logActivity(id, user.id, "comment")
  const item = serializeItem(id)!
  broadcastToBoard(row.boardId, { type: "item.upsert", boardId: row.boardId, item, actorId: user.id })
  return c.json(item, 201)
})

routes.post("/items/:id/checklist", async (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const row = db.query("SELECT id, board_id AS boardId FROM items WHERE id = ?").get(id) as { id: string; boardId: string } | null
  if (!row) return c.json({ error: "Not found" }, 404)
  if (!boardWorkspace(row.boardId, user.id)) return c.json({ error: "Forbidden" }, 403)
  const body = await c.req.json().catch(() => null)
  const text = String(body?.text || "").trim().slice(0, 500)
  if (!text) return c.json({ error: "Text is empty" }, 400)

  const entryId = newId("ckl")
  const count = db.query("SELECT COUNT(*) AS n FROM checklist_items WHERE item_id = ?").get(id) as { n: number }
  db.transaction(() => {
    db.query("INSERT INTO checklist_items (id, item_id, text, done, position) VALUES (?, ?, ?, 0, ?)")
      .run(entryId, id, text, count.n)
    db.query("UPDATE items SET updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now(), id)
  })()
  logActivity(id, user.id, "checklist")
  const item = serializeItem(id)!
  broadcastToBoard(row.boardId, { type: "item.upsert", boardId: row.boardId, item, actorId: user.id })
  return c.json(item, 201)
})

routes.patch("/items/:id/checklist/:entryId", async (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const entryId = c.req.param("entryId")
  const row = db.query("SELECT id, board_id AS boardId FROM items WHERE id = ?").get(id) as { id: string; boardId: string } | null
  if (!row) return c.json({ error: "Not found" }, 404)
  if (!boardWorkspace(row.boardId, user.id)) return c.json({ error: "Forbidden" }, 403)
  const body = await c.req.json().catch(() => null)
  const entry = db.query("SELECT id FROM checklist_items WHERE id = ? AND item_id = ?").get(entryId, id)
  if (!entry) return c.json({ error: "Not found" }, 404)

  const patch: string[] = []
  const values: (string | number)[] = []
  if (typeof body?.text === "string" && body.text.trim()) {
    patch.push("text = ?")
    values.push(body.text.trim().slice(0, 500))
  }
  if (typeof body?.done === "boolean") {
    patch.push("done = ?")
    values.push(body.done ? 1 : 0)
  }
  if (patch.length) {
    values.push(entryId)
    db.query(`UPDATE checklist_items SET ${patch.join(", ")} WHERE id = ?`).run(...values)
    db.query("UPDATE items SET updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now(), id)
  }
  const item = serializeItem(id)!
  broadcastToBoard(row.boardId, { type: "item.upsert", boardId: row.boardId, item, actorId: user.id })
  return c.json(item)
})

routes.delete("/items/:id/checklist/:entryId", (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const entryId = c.req.param("entryId")
  const row = db.query("SELECT id, board_id AS boardId FROM items WHERE id = ?").get(id) as { id: string; boardId: string } | null
  if (!row) return c.json({ error: "Not found" }, 404)
  if (!boardWorkspace(row.boardId, user.id)) return c.json({ error: "Forbidden" }, 403)
  db.query("DELETE FROM checklist_items WHERE id = ? AND item_id = ?").run(entryId, id)
  db.query("UPDATE items SET updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now(), id)
  const item = serializeItem(id)!
  broadcastToBoard(row.boardId, { type: "item.upsert", boardId: row.boardId, item, actorId: user.id })
  return c.json(item)
})

export default routes