/**
 * Image attachment upload + serving.
 * POST /api/uploads  — authenticated image upload, returns { url, filename, ... }
 * GET  /uploads/:id   — serve an uploaded image (public, cached)
 */

import { Hono } from "hono"
import { getSessionUser } from "../lib/auth.js"
import config from "../config.js"
import { newId } from "../lib/ids.js"
import path from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import { db, now } from "../db/connection.js"

export const uploadApi = new Hono()
export const uploadStatic = new Hono()

const UPLOAD_DIR = path.join(config.dataDir, "uploads")
mkdirSync(UPLOAD_DIR, { recursive: true })

// Basic image dimension sniffing (reads PNG / JPEG headers).
function imageSize(buf: Buffer): { width: number; height: number } | null {
  // PNG: bytes 0-7 are signature, 16-23 are width/height (big-endian)
  if (buf.length >= 24 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const w = buf.readUInt32BE(16)
    const h = buf.readUInt32BE(20)
    return { width: w, height: h }
  }
  // JPEG: scan for SOF0 marker (0xFFC0) or SOF2 (0xFFC2)
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i < buf.length - 1) {
      const marker = buf[i + 1]
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        if (i + 9 <= buf.length) {
          const h = buf.readUInt16BE(i + 5)
          const w = buf.readUInt16BE(i + 7)
          return { width: w, height: h }
        }
      }
      i += 2 + (buf.length > i + 3 ? buf.readUInt16BE(i + 2) : 0)
    }
  }
  return null
}

uploadApi.post("/", async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.json({ error: "Not authenticated" }, 401)

  const contentType = c.req.header("content-type") || ""
  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "Expected multipart/form-data" }, 400)
  }

  const form = await c.req.formData()
  const file = form.get("file") as File | null
  if (!file || !file.size) {
    return c.json({ error: "No file provided" }, 400)
  }

  if (file.size > config.maxUploadBytes) {
    return c.json({ error: `File too large (max ${config.maxUploadBytes / 1024 / 1024} MiB)` }, 413)
  }

  const ct = file.type || "application/octet-stream"
  if (!ct.startsWith("image/")) {
    return c.json({ error: "Only image uploads are supported" }, 400)
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const dims = imageSize(buf)

  // Generate a unique filename, preserving the extension.
  const ext = path.extname(file.name).toLowerCase() || ".png"
  const id = newId("att")
  const storedName = `${id}${ext}`
  const storedPath = path.join(UPLOAD_DIR, storedName)
  writeFileSync(storedPath, buf)

  // Store metadata in the DB.
  const url = `/uploads/${storedName}`
  db.query(
    "INSERT INTO feedback_attachments (id, thread_id, message_id, filename, content_type, size_bytes, thumb_url, url, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?)"
  ).run(id, file.name, ct, buf.length, null, url, now())

  return c.json({
    url,
    filename: file.name,
    width: dims?.width,
    height: dims?.height,
    size: buf.length,
  })
})

// GET /uploads/:id — serve an uploaded attachment (public, cached)
uploadStatic.get("/:id", async (c) => {
  const filename = c.req.param("id")
  if (!/^[\w.-]+$/.test(filename)) return c.json({ error: "Invalid filename" }, 400)
  if (filename.includes('..')) return c.json({ error: "Invalid filename" }, 400)
  const filePath = path.join(UPLOAD_DIR, filename)
  const f = Bun.file(filePath)
  if (!(await f.exists())) return c.json({ error: "Not found" }, 404)
  const ext = path.extname(filename).toLowerCase()
  const mime: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  }
  return new Response(f, {
    headers: { "Content-Type": mime[ext] || "application/octet-stream", "Cache-Control": "public, max-age=86400" },
  })
})

export default uploadApi
