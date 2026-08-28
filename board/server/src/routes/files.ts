/**
 * /api/files — image/attachment uploads. Bytes are stored on disk under
 * DATA_DIR/uploads (gitignored); rows in the files table. Served auth-gated
 * (must be a member of the owning workspace).
 */

import { Hono } from "hono"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { db, now } from "../db/connection.js"
import { newId } from "../lib/ids.js"
import { authRequired, getAuthUser } from "../middleware/auth.js"
import { workspaceRole } from "../lib/dto.js"
import config from "../config.js"

const routes = new Hono()
routes.use("*", authRequired)

const UPLOAD_DIR = path.join(config.dataDir, "uploads")
mkdirSync(UPLOAD_DIR, { recursive: true })

const ALLOWED_MIME = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/avif",
  "text/plain", "text/markdown", "application/pdf",
])

routes.post("/", async (c) => {
  const { user } = getAuthUser(c)!
  const workspaceId = c.req.query("workspaceId") || ""
  if (!workspaceRole(workspaceId, user.id)) return c.json({ error: "Not a member" }, 403)

  const form = await c.req.formData()
  const file = form.get("file")
  if (!(file instanceof File)) return c.json({ error: "No file" }, 400)
  if (file.size > config.maxUploadBytes) return c.json({ error: "File too large (max 8 MiB)" }, 413)
  if (!ALLOWED_MIME.has(file.type)) return c.json({ error: "Unsupported file type" }, 415)

  const id = newId("file")
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "unnamed"
  const ext = path.extname(safeName).slice(0, 12)
  const diskName = `${id}${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  await Bun.write(path.join(UPLOAD_DIR, diskName), bytes)

  db.query("INSERT INTO files (id, workspace_id, owner_id, name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, workspaceId, user.id, safeName, file.type, file.size, now())

  return c.json({ id, name: safeName, mime: file.type, size: file.size, createdAt: now() }, 201)
})

routes.get("/:id", async (c) => {
  const { user } = getAuthUser(c)!
  const id = c.req.param("id")
  const row = db.query("SELECT id, workspace_id AS workspaceId, name, mime FROM files WHERE id = ?").get(id) as
    { id: string; workspaceId: string; name: string; mime: string } | null
  if (!row) return c.json({ error: "Not found" }, 404)
  if (!workspaceRole(row.workspaceId, user.id)) return c.json({ error: "Forbidden" }, 403)

  const ext = path.extname(row.name).slice(0, 12)
  const file = Bun.file(path.join(UPLOAD_DIR, `${row.id}${ext}`))
  if (!(await file.exists())) return c.json({ error: "Not found" }, 404)
  return new Response(file, {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "private, max-age=3600",
    },
  })
})

export default routes