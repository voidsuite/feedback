/** Client-side models for docs (Void Docs). */

export type Theme = "dark" | "light" | "system"
export type Accent = "stone" | "violet" | "emerald" | "amber" | "sky" | "rose"
export type PageSize = "a4" | "letter"
export type PageOrientation = "portrait" | "landscape"
export type PageMode = "paged" | "pageless"

export interface PageSettings {
  size: PageSize
  orientation: PageOrientation
  /** Margin in points (applies to all four sides). */
  margins: number
  mode: PageMode
  /** 0.5 – 2.0 */
  zoom: number
}

export const defaultPageSettings: PageSettings = {
  size: "a4",
  orientation: "portrait",
  margins: 72,
  mode: "paged",
  zoom: 1,
}

export interface DocMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  /** AES-GCM(VaultKey, rawDocKey), base64(iv||ct). */
  wrappedDocKey: string
  starred: boolean
  ownerId?: string
  page: PageSettings
  lastCheckpointAt?: number
  deleted?: boolean
}

export interface VersionRecord {
  id: string
  docId: string
  kind: "auto" | "named"
  name?: string
  createdAt: number
  author?: string
  /** base64(iv||ct) of Y.encodeStateAsUpdate(doc), encrypted with the doc key. */
  snapshotB64: string
}

export interface CommentReply {
  id: string
  author: string
  authorColor?: string
  text: string
  createdAt: number
}

export interface CommentThread {
  id: string
  text: string
  author: string
  authorColor?: string
  createdAt: number
  resolved: boolean
  resolvedBy?: string
  replies: CommentReply[]
}

export interface AppSettings {
  theme: Theme
  accent: Accent
  syncEnabled: boolean
  lastSync: number | null
  /** Show the document outline sidebar by default. */
  showOutline: boolean
  /** Whether "suggestion" mode is the default editing mode. */
  suggestionMode: boolean
}

export const defaultSettings: AppSettings = {
  theme: "dark",
  accent: "stone",
  syncEnabled: false,
  lastSync: null,
  showOutline: true,
  suggestionMode: false,
}

export type SyncState = {
  state: "idle" | "syncing" | "synced" | "error"
  message?: string
  lastSync?: number
}

/** Font choice available in the toolbar picker. */
export interface FontDef {
  /** font-family string to apply. */
  family: string
  label: string
  /** @fontsource css module (optional; system fonts have none). */
  source?: string
  system?: boolean
}
