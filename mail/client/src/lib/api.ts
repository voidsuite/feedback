/**
 * m3il API client — one interface, three backends:
 *
 *  - "backend" (default): auth + storage go through the m3il gateway
 *    (/api/auth, /api/storage). Mail always uses the gateway (/api/mail).
 *  - "browser": auth via the @voidauth/client browser SDK (PKCE, tokens in
 *    sessionStorage); storage hits the VoidAuth API directly with a Bearer
 *    token; mail still needs the gateway (VITE_API_URL).
 *  - "offline": no network at all; local IndexedDB only.
 */

import type { FetchedMessage, MailAccount } from "./types"

export type AuthMode = "backend" | "browser" | "offline"

export const authMode: AuthMode =
  (import.meta.env.VITE_AUTH_MODE as AuthMode) || "backend"

export const gatewayBase = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "")
export const voidauthIssuer = (import.meta.env.VITE_VOIDAUTH_ISSUER || "https://auth.stwupid.tech").replace(/\/+$/, "")
export const voidauthClientId = import.meta.env.VITE_VOIDAUTH_CLIENT_ID || "m3il"

const CLIENT_ID = voidauthClientId

export interface SessionUser {
  id: string
  name: string
  email: string
}

export class ApiError extends Error {
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
    if (res.status === 401 && retry && authMode === "backend") {
      const refreshed = await refreshSession()
      if (refreshed) return gateway<T>(path, options, false)
    }
    throw new ApiError(await readError(res), res.status)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// --- Browser SDK (lazy singleton) ---

let sdkInstance: any = null

async function getSdk(): Promise<any> {
  if (sdkInstance) return sdkInstance
  const { VoidAuth } = await import("@voidauth/client/browser")
  sdkInstance = new VoidAuth({
    issuer: voidauthIssuer,
    clientId: voidauthClientId,
    redirectUri: `${window.location.origin}/oauth/callback`,
    scopes: ["openid", "profile", "email"],
  })
  return sdkInstance
}

// --- Auth ---

export async function startLogin(keepMeLoggedIn = true): Promise<void> {
  if (authMode === "offline") return
  if (authMode === "browser") {
    const sdk = await getSdk()
    await sdk.login()
    return
  }
  // The callback page needs to know this after the OAuth round-trip.
  sessionStorage.setItem("m3il_keep_me_logged_in", keepMeLoggedIn ? "1" : "0")
  const { authUrl } = await gateway<{ authUrl: string }>("/api/auth/login")
  const separator = authUrl.includes("?") ? "&" : "?"
  window.location.href = `${authUrl}${separator}keep_me_logged_in=${keepMeLoggedIn}`
}

export async function handleCallback(code: string, state: string, keepMeLoggedIn = true): Promise<SessionUser> {
  if (authMode === "browser") {
    const sdk = await getSdk()
    const { user } = await sdk.handleCallback()
    return user
  }
  const { user } = await gateway<{ user: SessionUser }>("/api/auth/exchange", {
    method: "POST",
    body: JSON.stringify({ code, state, keepMeLoggedIn }),
  })
  return user
}

export async function getMe(): Promise<SessionUser | null> {
  if (authMode === "offline") return null
  if (authMode === "browser") {
    const sdk = await getSdk()
    if (!sdk.isAuthenticated()) return null
    return sdk.getUser() || null
  }
  try {
    const { user } = await gateway<{ user: SessionUser }>("/api/auth/me")
    return user
  } catch {
    return null
  }
}

export async function refreshSession(): Promise<boolean> {
  if (authMode !== "backend") return false
  try {
    const res = await fetch(`${gatewayBase}/api/auth/refresh`, { method: "POST", credentials: "include" })
    return res.ok
  } catch {
    return false
  }
}

export async function logout(): Promise<void> {
  if (authMode === "offline") return
  if (authMode === "browser") {
    const sdk = await getSdk()
    await sdk.logout()
    return
  }
  await gateway("/api/auth/logout", { method: "POST" }).catch(() => {})
}

async function requireBearer(): Promise<string> {
  const sdk = await getSdk()
  const token = sdk.getToken()
  if (!token) throw new ApiError("Not authenticated", 401)
  return token
}

// --- VoidAuth storage (backend proxy or direct bearer) ---

async function storageFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (authMode === "offline") throw new ApiError("Offline mode has no cloud storage", 400)
  if (authMode === "browser") {
    const token = await requireBearer()
    const res = await fetch(`${voidauthIssuer}${path}`, {
      ...options,
      headers: { ...(options.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new ApiError(await readError(res), res.status)
    return (await res.json()) as T
  }
  return gateway<T>(`/api/storage${path}`, options)
}

export async function getStorageUsage(): Promise<{ used: number; quota: number; files: number }> {
  try {
    return await storageFetch<{ used: number; quota: number; files: number }>("/usage")
  } catch {
    return { used: 0, quota: 104857600, files: 0 }
  }
}

export async function getAppData(key: string): Promise<{ key: string; value: unknown; createdAt: string; updatedAt: string } | null> {
  try {
    return await storageFetch(`/data?client_id=${encodeURIComponent(CLIENT_ID)}&key=${encodeURIComponent(key)}`)
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export async function saveAppData(key: string, value: unknown): Promise<void> {
  await storageFetch("/data", {
    method: "POST",
    body: JSON.stringify({ client_id: CLIENT_ID, key, value }),
  })
}

export async function deleteAppData(key: string): Promise<void> {
  await storageFetch(`/data?client_id=${encodeURIComponent(CLIENT_ID)}&key=${encodeURIComponent(key)}`, {
    method: "DELETE",
  })
}

export async function uploadFile(file: File): Promise<{ id: string; url?: string }> {
  if (authMode === "browser") {
    const token = await requireBearer()
    const form = new FormData()
    form.append("file", file)
    const res = await fetch(`${voidauthIssuer}/storage/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    if (!res.ok) throw new ApiError(await readError(res), res.status)
    return (await res.json()) as { id: string; url?: string }
  }
  if (authMode === "backend") {
    const form = new FormData()
    form.append("file", file)
    const res = await fetch(`${gatewayBase}/api/storage/files`, {
      method: "POST",
      credentials: "include",
      body: form,
    })
    if (!res.ok) throw new ApiError(await readError(res), res.status)
    return (await res.json()) as { id: string; url?: string }
  }
  throw new ApiError("Offline mode has no cloud storage", 400)
}

export async function listFiles(): Promise<{ files: { id: string; originalName: string; sizeBytes: number }[] }> {
  return storageFetch("/files")
}

export async function deleteFile(id: string): Promise<void> {
  await storageFetch(`/files/${encodeURIComponent(id)}`, { method: "DELETE" })
}

// --- Mail gateway (SMTP/POP3 relay) ---

export async function sendMail(payload: {
  account: MailAccount
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text?: string
  html?: string
  attachments?: { filename: string; contentType: string; contentBase64: string }[]
}): Promise<{ messageId: string }> {
  return gateway("/api/mail/send", { method: "POST", body: JSON.stringify(payload) })
}

export async function fetchMail(account: MailAccount, maxMessages = 50): Promise<{ messages: FetchedMessage[]; total: number; fetched: number }> {
  return gateway("/api/mail/fetch", {
    method: "POST",
    body: JSON.stringify({ account, maxMessages }),
  })
}

export async function testAccount(account: MailAccount): Promise<{ smtp: { ok: boolean; error?: string }; pop3: { ok: boolean; error?: string } }> {
  return gateway("/api/mail/test", { method: "POST", body: JSON.stringify({ account }) })
}