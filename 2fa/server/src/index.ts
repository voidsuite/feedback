import { Hono } from "hono"
import { cors } from "hono/cors"
import { fileURLToPath } from "node:url"
import path from "node:path"
import config from "./config.js"
import authRoutes from "./routes/auth.js"
import storageRoutes from "./routes/storage.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, "../../dist")

const app = new Hono()

app.use("*", cors({
  origin: config.appUrl,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  credentials: true,
}))

app.route("/api/auth", authRoutes)
app.route("/api/storage", storageRoutes)

app.get("/api/icons/:slug", async (c) => {
  const slug = c.req.param("slug")
  const name = c.req.query("name") || slug
  try {
    const aegisUrl = `https://raw.githubusercontent.com/aegis-icons/aegis-icons/master/icons/1_Primary/${encodeURIComponent(name)}.svg`
    const aegisRes = await fetch(aegisUrl)
    if (aegisRes.ok) {
      const svg = await aegisRes.text()
      return c.body(svg, 200, {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
      })
    }
    const simpleRes = await fetch(`https://cdn.simpleicons.org/${slug}`)
    if (!simpleRes.ok) return c.json({ error: "Icon not found" }, 404)
    const svg = await simpleRes.text()
    return c.body(svg, 200, {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
    })
  } catch {
    return c.json({ error: "Failed to fetch icon" }, 502)
  }
})

app.get("/health", (c) => c.json({ status: "ok" }))

const MIME_TYPES: Record<string, string> = {
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  eot: "application/vnd.ms-fontobject",
  txt: "text/plain",
  pdf: "application/pdf",
  map: "application/json",
}

app.get("*", async (c) => {
  const reqPath = c.req.path
  const filePath = reqPath === "/" ? "/index.html" : reqPath
  const ext = filePath.split(".").pop() || ""
  const f = Bun.file(DIST_DIR + filePath)
  const exists = await f.exists()
  if (exists) {
    return new Response(f, {
      headers: { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" },
    })
  }
  if (!reqPath.startsWith("/api/")) {
    const fallback = Bun.file(DIST_DIR + "/index.html")
    const fbExists = await fallback.exists()
    if (fbExists) return new Response(fallback, {
      headers: { "Content-Type": "text/html" },
    })
  }
  return c.json({ error: "Not found" }, 404)
})

export default {
  port: config.port,
  fetch: app.fetch,
}
