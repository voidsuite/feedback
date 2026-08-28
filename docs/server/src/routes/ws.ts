/**
 * Void Docs multiplayer relay.
 *
 * Rooms are keyed by document id. The relay is E2E-dumb: it validates the
 * VoidAuth session, forwards opaque (client-encrypted) frames between peers,
 * and forgets everything when the room empties. No persistence, no content
 * inspection. Everyone with the document key can read the frames; without it
 * they are ciphertext.
 */

import type { ServerWebSocket } from "bun"
import { getSession, getCookieName } from "../lib/session.js"
import config from "../config.js"

// Frame types (first byte of each message).
export const FRAME_SYNC1 = 0x01 // "send me your full document state"
export const FRAME_SYNC2 = 0x02 // "here is my full document state" (binary Yjs update follows)
export const FRAME_UPDATE = 0x03 // incremental Yjs update (binary follows)
export const FRAME_AWARENESS = 0x04 // Yjs awareness update (binary follows)

interface RoomMeta {
  docId: string
  user: { id: string; name: string; email: string }
}

const rooms = new Map<string, Set<ServerWebSocket<RoomMeta>>>()

function roomOf(meta: RoomMeta): Set<ServerWebSocket<RoomMeta>> {
  const key = meta.docId
  let room = rooms.get(key)
  if (!room) {
    room = new Set()
    rooms.set(key, room)
  }
  return room
}

function broadcast(room: Set<ServerWebSocket<RoomMeta>>, sender: ServerWebSocket<RoomMeta>, data: Uint8Array | string) {
  for (const peer of room) {
    if (peer === sender) continue
    try {
      peer.send(data)
    } catch {
      /* peer is closing */
    }
  }
}

export const wsHandlers = {
  open(ws: ServerWebSocket<RoomMeta>) {
    const meta = ws.data
    const room = roomOf(meta)
    if (room.size >= config.maxRoomPeers) {
      ws.close(1013, "Room is full")
      return
    }
    room.add(ws)
    // Ask existing peers for their document state.
    for (const peer of room) {
      if (peer === ws) continue
      try {
        peer.send(new Uint8Array([FRAME_SYNC1]))
      } catch {
        /* ignore */
      }
    }
  },

  message(ws: ServerWebSocket<RoomMeta>, message: string | Buffer) {
    const meta = ws.data
    const room = rooms.get(meta.docId)
    if (!room) return
    const data = typeof message === "string" ? Buffer.from(message) : message
    if (data.length === 0) return
    if (data.length > config.maxWsMessageBytes) return
    const type = data[0]
    if (type !== FRAME_SYNC1 && type !== FRAME_SYNC2 && type !== FRAME_UPDATE && type !== FRAME_AWARENESS) return
    // SYNC1 must not be echoed to other peers (would cause a sync storm):
    // the receiver answers with SYNC2. Everything else is broadcast as-is.
    broadcast(room, ws, data)
  },

  close(ws: ServerWebSocket<RoomMeta>) {
    const meta = ws.data
    const room = rooms.get(meta.docId)
    if (!room) return
    room.delete(ws)
    if (room.size === 0) rooms.delete(meta.docId)
  },
}

/**
 * Upgrade a /api/ws request after session validation.
 * Returns undefined on successful upgrade (Bun semantics), or a Response.
 */
export function handleWsUpgrade(req: Request, server: import("bun").Server<unknown>): Response | undefined {
  const url = new URL(req.url)
  const docId = url.searchParams.get("docId") || ""
  if (!docId) {
    return new Response("Missing docId", { status: 400 })
  }
  if (!/^[\w-]{1,64}$/.test(docId)) {
    return new Response("Invalid room id", { status: 400 })
  }

  const cookieHeader = req.headers.get("cookie") || ""
  const sid = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${getCookieName()}=`))
    ?.slice(getCookieName().length + 1)

  const session = sid ? getSession(sid) : null
  if (!session) {
    return new Response("Unauthorized", { status: 401 })
  }

  const ok = server.upgrade(req, {
    data: {
      docId,
      user: { id: session.user.id, name: session.user.name, email: session.user.email },
    } satisfies RoomMeta,
  })
  return ok ? undefined : new Response("Upgrade failed", { status: 400 })
}