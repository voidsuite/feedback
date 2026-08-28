/**
 * Void Feedback API client — backend PKCE auth proxied through the gateway
 * (same pattern as VoidBoard). The gateway issues an httpOnly session cookie;
 * the browser never touches OAuth tokens.
 */

import type { ThreadDetail, ThreadSummary, Message, AdminStats, SourceStat, NotifyTarget, ThreadType, ThreadStatus, ThreadPriority, NotifyTargetType, NotifyEvent } from "./types"

// Re-export types so consumers can import them from "@/lib/api".
export type {
  ThreadDetail, ThreadSummary, Message, AdminStats, SourceStat,
  NotifyTarget, ThreadType, ThreadStatus, ThreadPriority,
  NotifyTargetType, NotifyEvent,
}

export type AuthMode = "backend" | "browser"
export const authMode: AuthMode = (import.meta.env.VITE_AUTH_MODE as AuthMode) || "backend"
export const gatewayBase = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "")
export const voidfeedbackUrl = (import.meta.env.VITE_FEEDBACK_URL || (typeof window !== "undefined" ? window.location.origin : "http://localhost:5179")).replace(/\/+$/, "")

class ApiError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.status = status
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error || data?.error_description || `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

async function gateway<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const res = await fetch(`${gatewayBase}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  })
  if (!res.ok) {
    if (res.status === 401 && retry) {
      const refreshed = await refreshSession()
      if (refreshed) return gateway<T>(path, options, false)
    }
    throw new ApiError(await readError(res), res.status)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// --- Auth ---

export async function startLogin(keepMeLoggedIn = true): Promise<void> {
  if (authMode === "browser") {
    const { VoidAuth } = await import("@voidauth/client/browser")
    const sdk = new VoidAuth({ issuer: import.meta.env.VITE_VOIDAUTH_ISSUER || "https://auth.stwupid.tech", clientId: import.meta.env.VITE_VOIDFEEDBACK_CLIENT_ID || "voidfeedback", redirectUri: `${window.location.origin}/oauth/callback`, scopes: ["openid", "profile", "email"] })
    await sdk.login()
    return
  }
  sessionStorage.setItem("voidfeedback_keep_me_logged_in", keepMeLoggedIn ? "1" : "0")
  const { authUrl } = await gateway<{ authUrl: string }>("/api/auth/login")
  const separator = authUrl.includes("?") ? "&" : "?"
  window.location.href = `${authUrl}${separator}keep_me_logged_in=${keepMeLoggedIn}`
}

export async function handleCallback(code: string, state: string, keepMeLoggedIn = true): Promise<User> {
  if (authMode === "browser") {
    const { VoidAuth } = await import("@voidauth/client/browser")
    const sdk = new VoidAuth({ issuer: import.meta.env.VITE_VOIDAUTH_ISSUER || "https://auth.stwupid.tech", clientId: import.meta.env.VITE_VOIDFEEDBACK_CLIENT_ID || "voidfeedback", redirectUri: `${window.location.origin}/oauth/callback`, scopes: ["openid", "profile", "email"] })
    await sdk.login()
    await sdk.handleCallback()
    const token = sdk.getToken()
    const { user } = await gateway<{ user: User }>("/api/auth/browser-session", { method: "POST", body: JSON.stringify({ accessToken: token }) })
    return user
  }
  const { user } = await gateway<{ user: User }>("/api/auth/exchange", { method: "POST", body: JSON.stringify({ code, state, keepMeLoggedIn }) })
  return user
}

export interface User {
  id: string
  name: string
  email: string
  picture?: string | null
  role?: string
}

export async function getMe(): Promise<User | null> {
  if (authMode === "browser") return null
  try {
    const { user } = await gateway<{ user: User }>("/api/auth/me")
    return user
  } catch {
    return null
  }
}

export async function refreshSession(): Promise<boolean> {
  try {
    const res = await fetch(`${gatewayBase}/api/auth/refresh`, { method: "POST", credentials: "include" })
    return res.ok
  } catch {
    return false
  }
}

export async function logout(): Promise<void> {
  await gateway("/api/auth/logout", { method: "POST" }).catch(() => {})
}

// --- Threads ---

export interface ListParams {
  type?: ThreadType
  status?: ThreadStatus
  sourceApp?: string
  assignee?: string
  author?: string
  unanswered?: boolean
  mine?: boolean
  publicOnly?: boolean
  q?: string
  sort?: "recent" | "top" | "active"
  limit?: number
  offset?: number
}

export function listThreads(params: ListParams = {}): Promise<{ threads: ThreadSummary[]; total: number }> {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v))
  }
  const qs = q.toString()
  return gateway(`/api/threads${qs ? `?${qs}` : ""}`)
}

export function getThread(id: string): Promise<{ thread: ThreadDetail }> {
  return gateway(`/api/threads/${id}`)
}

export function createThread(input: { type: ThreadType; sourceApp?: string | null; title: string; bodyMarkdown: string; priority: ThreadPriority }): Promise<{ thread: ThreadDetail }> {
  return gateway("/api/threads", { method: "POST", body: JSON.stringify(input) })
}

export function updateThread(id: string, patch: Partial<{ title: string; bodyMarkdown: string; status: ThreadStatus; priority: ThreadPriority; assigneeId: string | null; isPublic: boolean }>): Promise<{ thread: ThreadDetail }> {
  return gateway(`/api/threads/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
}

export function deleteThread(id: string): Promise<{ ok: boolean }> {
  return gateway(`/api/threads/${id}`, { method: "DELETE" })
}

// --- Messages ---

export function listMessages(threadId: string): Promise<{ messages: Message[] }> {
  return gateway(`/api/threads/${threadId}/messages`)
}

export function sendMessage(threadId: string, body: string, isInternal = false): Promise<{ message: Message }> {
  return gateway(`/api/threads/${threadId}/messages`, { method: "POST", body: JSON.stringify({ body, isInternal }) })
}

// --- Votes ---

export function voteThread(threadId: string): Promise<{ voted: boolean; votes: number }> {
  return gateway(`/api/threads/${threadId}/vote`, { method: "POST" })
}

export function unvoteThread(threadId: string): Promise<{ voted: boolean; votes: number }> {
  return gateway(`/api/threads/${threadId}/vote`, { method: "DELETE" })
}

// --- Admin ---

export function getStats(): Promise<AdminStats> {
  return gateway("/api/admin/stats")
}

export function getSources(): Promise<{ sources: SourceStat[] }> {
  return gateway("/api/admin/sources")
}

export function listTargets(): Promise<{ targets: NotifyTarget[] }> {
  return gateway("/api/admin/notifications/targets")
}

export function createTarget(input: { type: NotifyTargetType; name: string; config: Record<string, unknown>; events: NotifyEvent[]; enabled: boolean }): Promise<{ target: NotifyTarget }> {
  return gateway("/api/admin/notifications/targets", { method: "POST", body: JSON.stringify(input) })
}

export function updateTarget(id: string, patch: Partial<{ name: string; config: Record<string, unknown>; events: NotifyEvent[]; enabled: boolean }>): Promise<{ target: NotifyTarget }> {
  return gateway(`/api/admin/notifications/targets/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
}

export function deleteTarget(id: string): Promise<{ ok: boolean }> {
  return gateway(`/api/admin/notifications/targets/${id}`, { method: "DELETE" })
}

export function testTarget(id: string): Promise<{ ok: boolean; error?: string }> {
  return gateway(`/api/admin/notifications/test/${id}`, { method: "POST" })
}

// --- Realtime ---

export function openThreadSocket(threadId: string): WebSocket {
  const proto = window.location.protocol === "https:" ? "wss" : "ws"
  const base = gatewayBase || `${proto}://${window.location.host}`
  const wsUrl = base.replace(/^http/, "ws")
  return new WebSocket(`${wsUrl}/api/ws?threadId=${encodeURIComponent(threadId)}`)
}

export function openSupportSocket(): WebSocket {
  const proto = window.location.protocol === "https:" ? "wss" : "ws"
  const base = gatewayBase || `${proto}://${window.location.host}`
  const wsUrl = base.replace(/^http/, "ws")
  return new WebSocket(`${wsUrl}/api/ws?lobby=support`)
}

export function openAdminSocket(): WebSocket {
  const proto = window.location.protocol === "https:" ? "wss" : "ws"
  const base = gatewayBase || `${proto}://${window.location.host}`
  const wsUrl = base.replace(/^http/, "ws")
  return new WebSocket(`${wsUrl}/api/ws?admin=1`)
}

// --- Namespace bundle — consumers can import { api } and call api.fn() ---

export const api = {
  authMode,
  startLogin,
  handleCallback,
  getMe,
  refreshSession,
  logout,
  listThreads,
  getThread,
  createThread,
  updateThread,
  deleteThread,
  listMessages,
  sendMessage,
  voteThread,
  unvoteThread,
  getStats,
  getSources,
  listTargets,
  createTarget,
  updateTarget,
  deleteTarget,
  testTarget,
  openThreadSocket,
  openSupportSocket,
  openAdminSocket,
}
