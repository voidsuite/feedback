/**
 * Shared server-side types for the mail gateway.
 */

export type TlsMode = "ssl" | "starttls" | "none"

export interface MailServerConfig {
  host: string
  port: number
  tls: TlsMode
  user: string
  pass: string
}

/** Full account config sent by the client per request (transient, never stored). */
export interface MailAccountPayload {
  id: string
  label: string
  email: string
  name?: string
  smtp: MailServerConfig
  pop3: MailServerConfig
}

export interface OutboundAttachment {
  filename: string
  contentType: string
  contentBase64: string
}

export interface SendMailRequest {
  account: MailAccountPayload
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text?: string
  html?: string
  attachments?: OutboundAttachment[]
}

export interface ParsedAddress {
  name: string
  email: string
}

export interface ParsedAttachment {
  filename: string
  mimeType: string
  size: number
  data: Uint8Array
}

export interface ParsedMessage {
  uid: string
  index: number
  headers: Record<string, string>
  subject: string
  from: ParsedAddress | null
  to: ParsedAddress[]
  cc: ParsedAddress[]
  date: string | null // ISO string, may be null if unparseable
  text: string | null
  html: string | null
  attachments: ParsedAttachment[]
}

/** JSON-safe wire shape returned by /api/mail/fetch (attachment bytes → base64). */
export interface FetchedMailAttachment {
  filename: string
  mimeType: string
  size: number
  dataBase64: string
}

export interface FetchedMailMessage {
  uid: string
  index: number
  subject: string
  from: ParsedAddress | null
  to: ParsedAddress[]
  cc: ParsedAddress[]
  date: string | null
  text: string | null
  html: string | null
  attachments: FetchedMailAttachment[]
}