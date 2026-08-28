/**
 * Cloud sync — end-to-end encrypted with the sync passphrase.
 *
 * The whole snapshot (accounts incl. credentials, message metadata + bodies,
 * settings) is serialized to JSON and encrypted with the passphrase
 * (AES-GCM-256, PBKDF2), then stored as one VoidAuth app-data value under
 * "m3il_sync_v1". Attachment bytes are too large for a JSON value, so each
 * is encrypted separately and uploaded as a storage *file*; the snapshot
 * keeps only references (fileId + public URL) to them.
 *
 * Nothing decryptable ever leaves the device: the passphrase never hits the
 * network, and the VoidAuth storage API only ever sees ciphertext.
 */

import { encrypt, decrypt, encryptBytes, decryptBytes } from "./crypto"
import * as db from "./db"
import * as api from "./api"
import type { AppSettings, MailAccount, MailMessage } from "./types"

export const SYNC_DATA_KEY = "m3il_sync_v1"
const ATT_REF_KEY = "m3il_att_refs"
const MAX_ATTACHMENT_SYNC = 8 * 1024 * 1024 // per attachment, bytes

interface AttachmentRef {
  id: string
  filename: string
  mimeType: string
  size: number
  fileId?: string
  url?: string
  uploadedAt?: number
  skipped?: boolean // too large to encrypt + upload
}

type SyncMessage = Omit<MailMessage, "attachments"> & { attachments: AttachmentRef[] }

export interface SyncSnapshot {
  v: 1
  updatedAt: number
  settings: AppSettings
  accounts: MailAccount[]
  messages: SyncMessage[]
}

interface AttRefsMap {
  [attId: string]: { fileId: string; url: string; size: number; uploadedAt: number }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function loadAttRefs(): Promise<AttRefsMap> {
  return (await db.kvGet<AttRefsMap>(ATT_REF_KEY)) || {}
}

export interface SyncBuildInput {
  settings: AppSettings
  accounts: MailAccount[]
  messages: MailMessage[]
  passphrase: string
}

/** Upload encrypted attachment bytes to the cloud; returns refs map. */
async function uploadAttachments(messages: MailMessage[], passphrase: string): Promise<AttRefsMap> {
  const refs = await loadAttRefs()
  for (const m of messages) {
    for (const att of m.attachments) {
      const existing = refs[att.id]
      if (existing && existing.size === att.size) continue
      if (!att.dataBase64) continue
      if (att.size > MAX_ATTACHMENT_SYNC) continue // meta only, never uploaded

      const encrypted = await encryptBytes(base64ToBytes(att.dataBase64), passphrase)
      const file = new File([encrypted as unknown as BlobPart], `m3il_att_${att.id}.bin`, {
        type: "application/octet-stream",
      })
      const uploaded = await api.uploadFile(file)
      refs[att.id] = { fileId: uploaded.id, url: uploaded.url || "", size: att.size, uploadedAt: Date.now() }
    }
  }
  await db.kvSet(ATT_REF_KEY, refs)
  return refs
}

/**
 * Push the current local state to VoidAuth storage, fully encrypted.
 * Returns number of messages synced (excluding deleted ones).
 */
export async function pushSync(input: SyncBuildInput): Promise<number> {
  const refs = await uploadAttachments(input.messages, input.passphrase)

  const messages: SyncMessage[] = input.messages
    .filter((m) => !m.deleted)
    .map((m) => ({
      ...m,
      attachments: m.attachments.map((att) => {
        const ref = refs[att.id]
        if (ref) {
          return { id: att.id, filename: att.filename, mimeType: att.mimeType, size: att.size, fileId: ref.fileId, url: ref.url, uploadedAt: ref.uploadedAt }
        }
        return { id: att.id, filename: att.filename, mimeType: att.mimeType, size: att.size, skipped: att.size > MAX_ATTACHMENT_SYNC }
      }),
    }))

  const snapshot: SyncSnapshot = {
    v: 1,
    updatedAt: Date.now(),
    settings: input.settings,
    accounts: input.accounts,
    messages,
  }
  const ciphertext = await encrypt(JSON.stringify(snapshot), input.passphrase)
  await api.saveAppData(SYNC_DATA_KEY, { v: 1, updatedAt: snapshot.updatedAt, ciphertext })
  return messages.length
}

export interface PullResult {
  snapshot: SyncSnapshot
  attachmentCount: number
}

/**
 * Download + decrypt the cloud snapshot. Throws on wrong passphrase
 * (decrypt fails) or offline mode. Restored attachment bytes are persisted
 * to the local attachment store here; message records keep meta only.
 */
export async function pullSync(passphrase: string): Promise<PullResult> {
  const data = await api.getAppData(SYNC_DATA_KEY)
  if (!data || !data.value || typeof data.value !== "object" || !("ciphertext" in (data.value as object))) {
    throw new Error("No cloud snapshot found")
  }
  const ciphertext = (data.value as { ciphertext: string }).ciphertext
  const json = await decrypt(ciphertext, passphrase)
  const snapshot = JSON.parse(json) as SyncSnapshot

  let attachmentCount = 0
  for (const m of snapshot.messages) {
    for (const ref of m.attachments) {
      if (!ref.fileId || !ref.url) continue
      const already = await db.loadAttachment(ref.id)
      if (already) continue
      try {
        const res = await fetch(ref.url)
        if (!res.ok) continue
        const encrypted = new Uint8Array(await res.arrayBuffer())
        const decrypted = await decryptBytes(encrypted, passphrase)
        const dataBase64 = bytesToBase64(decrypted)
        await db.saveAttachment({ id: ref.id, filename: ref.filename, mimeType: ref.mimeType, size: ref.size, dataBase64 })
        attachmentCount += 1
      } catch {
        /* a failed attachment download should not abort the whole restore */
      }
    }
  }
  return { snapshot, attachmentCount }
}

/** Remove all m3il data from VoidAuth storage (data value + uploaded files). */
export async function clearCloud(): Promise<void> {
  const refs = await loadAttRefs()
  const ids = new Set(Object.values(refs).map((r) => r.fileId).filter(Boolean))
  for (const id of ids) {
    await api.deleteFile(id).catch(() => {})
  }
  await api.deleteAppData(SYNC_DATA_KEY).catch(() => {})
  await db.kvSet(ATT_REF_KEY, {})
}