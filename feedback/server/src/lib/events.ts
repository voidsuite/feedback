/**
 * Realtime event bus for Void Feedback.
 *
 * Rooms:
 *   - thread:<id>  live chat on a single feedback thread / support session
 *   - support       the support lobby (presence + new support sessions)
 *   - admin         admins only — presence + inbox badge bumps
 *
 * The gateway broadcasts server-authoritative events; the client reconciles by
 * id, so echoes to the sender are harmless.
 */

import type { ServerWebSocket } from "bun"

export interface ConnMeta {
  userId: string
  userName: string
  userPicture?: string | null
  userRole: string
  threadId?: string
  lobby?: "support"
  admin?: boolean
}

const rooms = new Map<string, Set<ServerWebSocket<ConnMeta>>>()

function room(name: string): Set<ServerWebSocket<ConnMeta>> {
  let set = rooms.get(name)
  if (!set) {
    set = new Set()
    rooms.set(name, set)
  }
  return set
}

function roomNames(meta: ConnMeta): string[] {
  const names: string[] = []
  if (meta.threadId) names.push(`thread:${meta.threadId}`)
  if (meta.lobby === "support") names.push("support")
  if (meta.admin) names.push("admin")
  return names
}

export function addToRooms(ws: ServerWebSocket<ConnMeta>): void {
  for (const name of roomNames(ws.data)) room(name).add(ws)
}

export function removeFromRooms(ws: ServerWebSocket<ConnMeta>): void {
  for (const name of roomNames(ws.data)) {
    const set = rooms.get(name)
    if (set) {
      set.delete(ws)
      if (set.size === 0) rooms.delete(name)
    }
  }
}

/** Members online in a namespace (deduped by user). */
export function onlineMembers(namespace: string): { userId: string; name: string; picture?: string | null; role: string }[] {
  const set = rooms.get(namespace)
  if (!set) return []
  const seen = new Map<string, { userId: string; name: string; picture?: string | null; role: string }>()
  for (const ws of set) {
    const m = ws.data
    if (!seen.has(m.userId)) seen.set(m.userId, { userId: m.userId, name: m.userName, picture: m.userPicture, role: m.userRole })
  }
  return [...seen.values()]
}

/** Online admins (for presence + routing support chats). */
export function onlineAdmins(): { userId: string; name: string; picture?: string | null }[] {
  return onlineMembers("admin")
}

export function broadcast(namespace: string, payload: unknown, except?: ServerWebSocket<ConnMeta>): void {
  const set = rooms.get(namespace)
  if (!set) return
  const data = JSON.stringify(payload)
  for (const ws of set) {
    if (ws === except) continue
    try {
      ws.send(data)
    } catch {
      /* peer closing */
    }
  }
}

export function broadcastToThread(threadId: string, payload: unknown): void {
  broadcast(`thread:${threadId}`, payload)
}

export function broadcastToSupport(payload: unknown): void {
  broadcast("support", payload)
}

export function broadcastToAdmins(payload: unknown): void {
  broadcast("admin", payload)
}
