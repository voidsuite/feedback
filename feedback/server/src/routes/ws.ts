/**
 * Void Feedback realtime — authenticated WebSocket.
 *
 * Query params pick the room:
 *   ?threadId=<id>   live chat on a thread (author / admin / public thread)
 *   ?lobby=support   the support lobby (any signed-in user; admins see the queue)
 *   ?admin=1         admins-only presence + inbox badge room
 *
 * The gateway validates the session (cookie) or bearer token, enforces thread
 * access, and tracks presence per room.
 */

import type { ServerWebSocket } from "bun"
import { getCookieName, getSession, type SessionUser } from "../db/sessions.js"
import { validateBearerToken } from "../lib/oauth.js"
import { getThread } from "../lib/threads.js"
import { addToRooms, removeFromRooms, onlineMembers, broadcastToThread, broadcastToSupport, broadcastToAdmins, type ConnMeta } from "../lib/events.js"

export const wsHandlers = {
  open(ws: ServerWebSocket<ConnMeta>) {
    addToRooms(ws)
    const m = ws.data
    if (m.threadId) {
      broadcastToThread(m.threadId, { type: "presence", threadId: m.threadId, members: onlineMembers(`thread:${m.threadId}`) })
    }
    if (m.lobby === "support") {
      broadcastToSupport({ type: "presence", members: onlineMembers("support") })
    }
    if (m.admin) {
      broadcastToAdmins({ type: "presence", members: onlineMembers("admin") })
    }
  },

  close(ws: ServerWebSocket<ConnMeta>) {
    const m = ws.data
    removeFromRooms(ws)
    if (m.threadId) {
      broadcastToThread(m.threadId, { type: "presence", threadId: m.threadId, members: onlineMembers(`thread:${m.threadId}`) })
    }
    if (m.lobby === "support") {
      broadcastToSupport({ type: "presence", members: onlineMembers("support") })
    }
    if (m.admin) {
      broadcastToAdmins({ type: "presence", members: onlineMembers("admin") })
    }
  },
}

export async function handleWsUpgrade(req: Request, server: import("bun").Server<unknown>): Promise<Response | undefined> {
  const url = new URL(req.url)
  const threadId = url.searchParams.get("threadId") || ""
  const lobby = url.searchParams.get("lobby") === "support" ? "support" : undefined
  const adminRoom = url.searchParams.get("admin") === "1"

  // Resolve the user: cookie session first, then bearer token.
  const cookieHeader = req.headers.get("cookie") || ""
  const sid = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${getCookieName()}=`))
    ?.slice(getCookieName().length + 1)
  let user: SessionUser | null = null
  if (sid) {
    const session = getSession(sid)
    if (session) user = session.user
  }
  if (!user) {
    const auth = req.headers.get("authorization") || ""
    const match = /^Bearer\s+(.+)$/i.exec(auth)
    if (match) {
      try {
        const oidc = await validateBearerToken(match[1])
        if (oidc.id) user = { id: oidc.id, name: oidc.name, email: oidc.email, picture: oidc.picture, role: oidc.role || "user" }
      } catch { /* unauthorized */ }
    }
  }
  if (!user) return new Response("Unauthorized", { status: 401 })

  const isAdminUser = user.role === "admin"

  // Admin presence room is admins-only.
  if (adminRoom && !isAdminUser) return new Response("Forbidden", { status: 403 })

  // Thread room requires access to the thread.
  if (threadId) {
    if (!/^[\w-]{1,64}$/.test(threadId)) return new Response("Invalid room id", { status: 400 })
    const thread = getThread(threadId, { id: user.id, isAdmin: isAdminUser })
    if (!thread) return new Response("Forbidden", { status: 403 })
  }

  const ok = server.upgrade(req, {
    data: {
      userId: user.id,
      userName: user.name,
      userPicture: user.picture ?? null,
      userRole: user.role || "user",
      threadId: threadId || undefined,
      lobby,
      admin: adminRoom,
    } satisfies ConnMeta,
  })
  return ok ? undefined : new Response("Upgrade failed", { status: 400 })
}
