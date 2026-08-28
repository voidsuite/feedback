/** Client-side models for m3il (Void Mail). */

export type TlsMode = "ssl" | "starttls" | "none"

export interface MailServerConfig {
  host: string
  port: number
  tls: TlsMode
  user: string
  pass: string // stored encrypted client-side (passphrase or device key)
}

export interface MailAccount {
  id: string
  label: string
  email: string
  name?: string
  color: string
  smtp: MailServerConfig
  pop3: MailServerConfig
  createdAt: number
  lastSync?: number
}

export type FolderId = "inbox" | "sent" | "drafts" | "flagged" | "all"

export interface Address {
  name: string
  email: string
}

export interface Attachment {
  id: string
  filename: string
  mimeType: string
  size: number
  dataBase64: string
}

export interface MailMessage {
  id: string
  accountId: string
  uid: string // POP3 UIDL (dedupe key)
  folder: FolderId
  subject: string
  from: Address | null
  to: Address[]
  cc: Address[]
  date: string | null // ISO
  text: string | null
  html: string | null
  attachments: Attachment[]
  read: boolean
  flagged: boolean
  syncedAt?: number
  updatedAt: number
  deleted?: boolean // tombstone for sync merge
}

export interface AppSettings {
  theme: "dark" | "light" | "system"
  accent: "stone" | "violet" | "emerald" | "amber" | "sky" | "rose"
  syncEnabled: boolean
  passphraseSet: boolean
  pinSet: boolean
  lastSync?: number
}

export const defaultSettings: AppSettings = {
  theme: "dark",
  accent: "stone",
  syncEnabled: false,
  passphraseSet: false,
  pinSet: false,
}

export interface FetchPayload {
  messages: MailMessage[]
  total: number
  fetched: number
}

/** Wire shape from /api/mail/fetch (server-side, before mapping to MailMessage). */
export interface FetchedAttachment {
  filename: string
  mimeType: string
  size: number
  dataBase64: string
}

export interface FetchedMessage {
  uid: string
  index: number
  subject: string
  from: Address | null
  to: Address[]
  cc: Address[]
  date: string | null
  text: string | null
  html: string | null
  attachments: FetchedAttachment[]
}

export interface MailSyncState {
  state: "idle" | "syncing" | "synced" | "error"
  message: string
  lastSync?: number
}