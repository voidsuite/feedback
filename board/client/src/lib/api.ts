/**
 * voidboard API client — two auth backends:
 *
 *  - "backend" (default): OAuth PKCE proxied through the voidboard gateway.
 *    The gateway issues an httpOnly session cookie; the browser never sees
 *    tokens. Recommended.
 *  - "browser": @voidauth/client browser SDK does PKCE directly against the
 *    VoidAuth server; the access token is sent to the gateway as a Bearer
 *    header and validated against VoidAuth userinfo.
 */

import type {
  Board, BoardDocument, Column, FileMeta, Item, ItemPriority, Label,
  Project, User, Workspace, WorkspaceMember,
} from "./types"

export type AuthMode = "backend" | "browser"

export const authMode: AuthMode = (import.meta.env.VITE_AUTH_MODE as AuthMode) || "backend"

export const gatewayBase = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "")
export const voidauthIssuer = (import.meta.env.VITE_VOIDAUTH_ISSUER || "https://auth.stwupid.tech").replace(/\/+$/, "")
export const voidauthClientId = import.meta.env.VITE_VOIDAUTH_CLIENT_ID || "voidboard"

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
    if (res.status === 401 && retry) {
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
  if (authMode === "browser") {
    const sdk = await getSdk()
    await sdk.login()
    return
  }
  sessionStorage.setItem("voidboard_keep_me_logged_in", keepMeLoggedIn ? "1" : "0")
  const { authUrl } = await gateway<{ authUrl: string }>("/api/auth/login")
  const separator = authUrl.includes("?") ? "&" : "?"
  window.location.href = `${authUrl}${separator}keep_me_logged_in=${keepMeLoggedIn}`
}

export async function handleCallback(code: string, state: string, keepMeLoggedIn = true): Promise<User> {
  if (authMode === "browser") {
    const sdk = await getSdk()
    await sdk.handleCallback()
    // Exchange the token for a gateway session.
    const token = sdk.getToken()
    const { user: sessionUser } = await gateway<{ user: User }>("/api/auth/browser-session", {
      method: "POST",
      body: JSON.stringify({ accessToken: token }),
    })
    return sessionUser
  }
  const { user } = await gateway<{ user: User }>("/api/auth/exchange", {
    method: "POST",
    body: JSON.stringify({ code, state, keepMeLoggedIn }),
  })
  return user
}

export async function getMe(): Promise<User | null> {
  if (authMode === "browser") {
    const sdk = await getSdk()
    if (!sdk.isAuthenticated()) return null
    return sdk.getUser() || null
  }
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
  if (authMode === "browser") {
    const sdk = await getSdk()
    await sdk.logout()
  }
  await gateway("/api/auth/logout", { method: "POST" }).catch(() => {})
}

// --- Workspaces ---

export function listWorkspaces(): Promise<Workspace[]> {
  return gateway("/api/workspaces")
}

export function createWorkspace(name: string): Promise<Workspace> {
  return gateway("/api/workspaces", { method: "POST", body: JSON.stringify({ name }) })
}

export function renameWorkspace(id: string, name: string): Promise<Workspace> {
  return updateWorkspace(id, { name })
}

export interface WorkspacePatch {
  name?: string
  avatarFileId?: string | null
}

export function updateWorkspace(id: string, patch: WorkspacePatch): Promise<Workspace> {
  return gateway(`/api/workspaces/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
}

export function deleteWorkspace(id: string): Promise<void> {
  return gateway(`/api/workspaces/${id}`, { method: "DELETE" })
}

export function getWorkspace(id: string): Promise<Workspace> {
  return gateway(`/api/workspaces/${id}`)
}

export function listProjects(workspaceId: string): Promise<Project[]> {
  return gateway(`/api/workspaces/${workspaceId}/projects`)
}

export function listBoards(workspaceId: string): Promise<Board[]> {
  return gateway(`/api/workspaces/${workspaceId}/boards`)
}

export function updateMemberRole(workspaceId: string, userId: string, role: WorkspaceMember["role"]): Promise<void> {
  return gateway(`/api/workspaces/${workspaceId}/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) })
}

export function removeMember(workspaceId: string, userId: string): Promise<void> {
  return gateway(`/api/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" })
}

export function rotateInviteToken(workspaceId: string, enabled: boolean): Promise<Workspace> {
  return gateway(`/api/workspaces/${workspaceId}/invite`, { method: "POST", body: JSON.stringify({ enabled }) })
}

export function joinByToken(token: string): Promise<Workspace> {
  return gateway(`/api/join/${token}`, { method: "POST" })
}

// --- Projects & boards ---

export function createProject(workspaceId: string, name: string): Promise<Project> {
  return gateway("/api/projects", { method: "POST", body: JSON.stringify({ workspaceId, name }) })
}

export function renameProject(id: string, name: string): Promise<Project> {
  return gateway(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ name }) })
}

export function recolorProject(id: string, color: string): Promise<Project> {
  return gateway(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ color }) })
}

export function deleteProject(id: string): Promise<void> {
  return gateway(`/api/projects/${id}`, { method: "DELETE" })
}

export function createBoard(workspaceId: string, name: string, projectId?: string | null): Promise<Board> {
  return gateway("/api/boards", { method: "POST", body: JSON.stringify({ workspaceId, name, projectId: projectId ?? null }) })
}

export function renameBoard(id: string, name: string): Promise<Board> {
  return updateBoard(id, { name })
}

export interface BoardPatch {
  name?: string
  avatarFileId?: string | null
}

export function updateBoard(id: string, patch: BoardPatch): Promise<Board> {
  return gateway(`/api/boards/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
}

export function deleteBoard(id: string): Promise<void> {
  return gateway(`/api/boards/${id}`, { method: "DELETE" })
}

export function getBoardDocument(id: string): Promise<BoardDocument> {
  return gateway(`/api/boards/${id}/document`)
}

// --- Columns & items ---

export function createColumn(boardId: string, name: string): Promise<Column> {
  return gateway("/api/columns", { method: "POST", body: JSON.stringify({ boardId, name }) })
}

export function renameColumn(id: string, name: string): Promise<Column> {
  return gateway(`/api/columns/${id}`, { method: "PATCH", body: JSON.stringify({ name }) })
}

export function setColumnWipLimit(id: string, wipLimit: number | null): Promise<Column> {
  return gateway(`/api/columns/${id}`, { method: "PATCH", body: JSON.stringify({ wipLimit }) })
}

export function reorderColumns(boardId: string, orderedIds: string[]): Promise<void> {
  return gateway(`/api/boards/${boardId}/columns/order`, { method: "POST", body: JSON.stringify({ orderedIds }) })
}

export function deleteColumn(id: string): Promise<void> {
  return gateway(`/api/columns/${id}`, { method: "DELETE" })
}

export interface ItemInput {
  boardId: string
  columnId: string
  title: string
}

export function createItem(input: ItemInput): Promise<Item> {
  return gateway("/api/items", { method: "POST", body: JSON.stringify(input) })
}

export function updateItem(id: string, patch: Partial<Pick<Item, "title" | "description" | "priority" | "dueDate" | "columnId" | "position" | "coverFileId">>): Promise<Item> {
  return gateway(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
}

/** Move an item to a column at an index (client computes fractional position). */
export function moveItem(id: string, columnId: string, position: number): Promise<Item> {
  return updateItem(id, { columnId, position })
}

export function deleteItem(id: string): Promise<void> {
  return gateway(`/api/items/${id}`, { method: "DELETE" })
}

// --- Labels, assignees, comments, checklist ---

export function createLabel(boardId: string, name: string, color: string): Promise<Label> {
  return gateway("/api/labels", { method: "POST", body: JSON.stringify({ boardId, name, color }) })
}

export function updateLabel(id: string, patch: { name?: string; color?: string }): Promise<Label> {
  return gateway(`/api/labels/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
}

export function deleteLabel(id: string): Promise<void> {
  return gateway(`/api/labels/${id}`, { method: "DELETE" })
}

export function setItemLabels(itemId: string, labelIds: string[]): Promise<Item> {
  return gateway(`/api/items/${itemId}/labels`, { method: "PUT", body: JSON.stringify({ labelIds }) })
}

export function setItemAssignees(itemId: string, userIds: string[]): Promise<Item> {
  return gateway(`/api/items/${itemId}/assignees`, { method: "PUT", body: JSON.stringify({ userIds }) })
}

export function addComment(itemId: string, body: string, parentId?: string | null): Promise<Item> {
  return gateway(`/api/items/${itemId}/comments`, { method: "POST", body: JSON.stringify({ body, parentId: parentId ?? null }) })
}

export function addChecklistEntry(itemId: string, text: string): Promise<Item> {
  return gateway(`/api/items/${itemId}/checklist`, { method: "POST", body: JSON.stringify({ text }) })
}

export function setChecklistEntry(itemId: string, entryId: string, text: string, done: boolean): Promise<Item> {
  return gateway(`/api/items/${itemId}/checklist/${entryId}`, { method: "PATCH", body: JSON.stringify({ text, done }) })
}

export function deleteChecklistEntry(itemId: string, entryId: string): Promise<Item> {
  return gateway(`/api/items/${itemId}/checklist/${entryId}`, { method: "DELETE" })
}

// --- Files ---

export async function uploadFile(workspaceId: string, file: File): Promise<FileMeta> {
  const form = new FormData()
  form.append("file", file)
  const res = await fetch(`${gatewayBase}/api/files?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: "POST",
    credentials: "include",
    body: form,
  })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return (await res.json()) as FileMeta
}

export function fileUrl(id: string): string {
  return `${gatewayBase}/api/files/${id}`
}

// --- Realtime ---

/** Connect to the board room. Resolves the open WebSocket. */
export function openBoardSocket(boardId: string): WebSocket {
  const proto = window.location.protocol === "https:" ? "wss" : "ws"
  const base = gatewayBase || `${proto}://${window.location.host}`
  const wsUrl = base.replace(/^http/, "ws")
  return new WebSocket(`${wsUrl}/api/ws?boardId=${encodeURIComponent(boardId)}`)
}

// --- Priorities / colors helpers ---

export const PRIORITY_LABELS: Record<string, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
}

export const PRIORITY_ORDER: ItemPriority[] = ["none", "low", "medium", "high", "urgent"]

export function comparePriority(a: ItemPriority, b: ItemPriority): number {
  return PRIORITY_ORDER.indexOf(a) - PRIORITY_ORDER.indexOf(b)
}