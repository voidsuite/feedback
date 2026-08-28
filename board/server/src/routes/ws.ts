/**
 * VoidBoard realtime — authenticated WebSocket.
 *
 * The client connects with a boardId (board page) or workspaceId (workspace
 * page). The gateway:
 *   - validates the session (cookie) or bearer token,
 *   - subscribes the socket to the board + workspace rooms,
 *   - broadcasts server-authoritative {type, ...} events to peers,
 *   - tracks presence (who's online) per board/workspace.
 *
 * Client→server traffic is limited to presence pings and cursor focus.
 */

import type { ServerWebSocket } from "bun"
import { getCookieName, getSession } from "../db/sessions.js"
import { validateBearerToken } from "../lib/oauth.js"
import { boardWorkspace } from "../lib/dto.js"
import { addToRooms, removeFromRooms, onlineMembers, broadcastToBoard, broadcastToWorkspace, type ConnMeta } from "../lib/events.js"

export const wsHandlers = {
  open(ws: ServerWebSocket<ConnMeta>) {
    addToRooms(ws)
    const m = ws.data
    if (m.boardId) {
      ws.send(JSON.stringify({ type: "presence", boardId: m.boardId, members: onlineMembers(`board:${m.boardId}`) }))
      broadcastToBoard(m.boardId, { type: "presence", boardId: m.boardId, members: onlineMembers(`board:${m.boardId}`) })
    }
    if (m.workspaceId) {
      ws.send(JSON.stringify({ type: "presence", workspaceId: m.workspaceId, members: onlineMembers(`workspace:${m.workspaceId}`) }))
      broadcastToWorkspace(m.workspaceId, { type: "presence", workspaceId: m.workspaceId, members: onlineMembers(`workspace:${m.workspaceId}`) })
    }
  },

  message(ws: ServerWebSocket<ConnMeta>, raw: string | Buffer) {
    const m = ws.data
    let msg: { type?: string; [key: string]: unknown }
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : raw.toString())
    } catch {
      return
    }
    if (msg.type === "cursor" && m.boardId) {
      const itemId = typeof msg.itemId === "string" ? msg.itemId : null
      broadcastToBoard(m.boardId, {
        type: "cursor",
        boardId: m.boardId,
        userId: m.userId,
        userName: m.userName,
        itemId,
        ts: Date.now(),
      })
    }
  },

  close(ws: ServerWebSocket<ConnMeta>) {
    const m = ws.data
    removeFromRooms(ws)
    if (m.boardId) {
      const members = onlineMembers(`board:${m.boardId}`)
      broadcastToBoard(m.boardId, { type: "presence", boardId: m.boardId, members })
    }
    if (m.workspaceId) {
      const members = onlineMembers(`workspace:${m.workspaceId}`)
      broadcastToWorkspace(m.workspaceId, { type: "presence", workspaceId: m.workspaceId, members })
    }
  },
}

export async function handleWsUpgrade(req: Request, server: import("bun").Server<unknown>): Promise<Response | undefined> {
  const url = new URL(req.url)
  const boardId = url.searchParams.get("boardId") || ""
  const workspaceId = url.searchParams.get("workspaceId") || ""
  if (!boardId && !workspaceId) return new Response("Missing boardId/workspaceId", { status: 400 })

  // Resolve the user: cookie session first, then bearer token.
  const cookieHeader = req.headers.get("cookie") || ""
  const sid = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${getCookieName()}=`))
    ?.slice(getCookieName().length + 1)
  let user: { id: string; name: string; email: string; picture?: string | null } | null = null

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
        user = { id: oidc.id, name: oidc.name, email: oidc.email, picture: oidc.picture }
      } catch {
        /* unauthorized */
      }
    }
  }
  if (!user) return new Response("Unauthorized", { status: 401 })

  // Workspace access check.
  let wsId: string | null = null
  if (boardId) {
    if (!/^[\w-]{1,64}$/.test(boardId)) return new Response("Invalid room id", { status: 400 })
    wsId = boardWorkspace(boardId, user.id)
    if (!wsId) return new Response("Forbidden", { status: 403 })
  }
  if (workspaceId) {
    if (!/^[\w-]{1,64}$/.test(workspaceId)) return new Response("Invalid room id", { status: 400 })
    // workspaceId param is informational; membership is enforced by boardWorkspace
    // for boards, and presence-only for the workspace page.
  }

  const ok = server.upgrade(req, {
    data: {
      userId: user.id,
      userName: user.name,
      userPicture: user.picture ?? null,
      boardId: boardId || undefined,
      workspaceId: (wsId || workspaceId) || undefined,
    } satisfies ConnMeta,
  })
  return ok ? undefined : new Response("Upgrade failed", { status: 400 })
}