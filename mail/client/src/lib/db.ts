/**
 * IndexedDB persistence for m3il.
 *
 * Trust model:
 *  - Message bodies and attachment data are encrypted at rest with the
 *    device key (AES-GCM) before being written to IndexedDB.
 *  - SMTP/POP3 passwords are encrypted with the device key as well.
 *  - List/search metadata (subject, from, date, flags) is kept in plaintext
 *    so the UI can render without decrypting every record; the cloud-sync
 *    copy includes this metadata inside an E2E passphrase-encrypted blob.
 */

import {
  encryptWithDeviceKey,
  decryptWithDeviceKey,
  randomId,
} from "./crypto"
import type { MailAccount, MailMessage } from "./types"

const DB_NAME = "m3il"
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv")
      if (!db.objectStoreNames.contains("accounts")) db.createObjectStore("accounts", { keyPath: "id" })
      if (!db.objectStoreNames.contains("messages")) db.createObjectStore("messages", { keyPath: "id" })
      if (!db.objectStoreNames.contains("attachments")) db.createObjectStore("attachments", { keyPath: "id" })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const request = run(t.objectStore(store))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
  )
}

// --- KV ---

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const value = await tx<any>("kv", "readonly", (s) => s.get(key))
    return value ?? null
  } catch {
    return null
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await tx("kv", "readwrite", (s) => s.put(value, key))
}

// --- Accounts (passwords encrypted) ---

export async function saveAccounts(accounts: MailAccount[]): Promise<void> {
  const t = (await openDb()).transaction("accounts", "readwrite")
  const store = t.objectStore("accounts")
  store.clear()
  for (const account of accounts) {
    const encAccount: MailAccount = {
      ...account,
      smtp: { ...account.smtp, pass: await encryptWithDeviceKey(account.smtp.pass) },
      pop3: { ...account.pop3, pass: await encryptWithDeviceKey(account.pop3.pass) },
    }
    store.put(encAccount)
  }
  await new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

export async function loadAccounts(): Promise<MailAccount[]> {
  const all = await tx<MailAccount[]>("accounts", "readonly", (s) => s.getAll())
  const out: MailAccount[] = []
  for (const a of all || []) {
    try {
      a.smtp.pass = (await decryptWithDeviceKey(a.smtp.pass)) || ""
      a.pop3.pass = (await decryptWithDeviceKey(a.pop3.pass)) || ""
      out.push(a)
    } catch {
      // skip accounts we cannot decrypt (key changed/cleared)
    }
  }
  return out
}

// --- Messages ---

interface StoredMessage extends Omit<MailMessage, "text" | "html" | "attachments"> {
  textEnc?: string
  htmlEnc?: string
  attachmentMeta?: { id: string; filename: string; mimeType: string; size: number }[]
}

async function encryptMessage(m: MailMessage): Promise<StoredMessage> {
  const { text, html, attachments, ...meta } = m
  return {
    ...meta,
    textEnc: text ? await encryptWithDeviceKey(text) : undefined,
    htmlEnc: html ? await encryptWithDeviceKey(html) : undefined,
    attachmentMeta: attachments.map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size })),
  }
}

async function decryptMessage(s: StoredMessage): Promise<MailMessage> {
  const { textEnc, htmlEnc, attachmentMeta, ...meta } = s
  const attachments = (attachmentMeta || []).map((a) => ({
    id: a.id,
    filename: a.filename,
    mimeType: a.mimeType,
    size: a.size,
    dataBase64: "", // lazy-loaded via loadAttachment
  }))
  return {
    ...meta,
    text: textEnc ? await decryptWithDeviceKey(textEnc) : null,
    html: htmlEnc ? await decryptWithDeviceKey(htmlEnc) : null,
    attachments,
  }
}

export async function upsertMessages(messages: MailMessage[]): Promise<void> {
  const db = await openDb()
  const t = db.transaction("messages", "readwrite")
  const store = t.objectStore("messages")
  for (const m of messages) {
    store.put(await encryptMessage(m))
  }
  await new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

export async function loadMessages(): Promise<MailMessage[]> {
  const all = await tx<StoredMessage[]>("messages", "readonly", (s) => s.getAll())
  const out: MailMessage[] = []
  for (const s of all || []) {
    try {
      out.push(await decryptMessage(s))
    } catch {
      /* skip undecryptable */
    }
  }
  return out
}

export async function deleteMessages(ids: string[]): Promise<void> {
  const db = await openDb()
  const t = db.transaction("messages", "readwrite")
  const store = t.objectStore("messages")
  for (const id of ids) store.delete(id)
  await new Promise<void>((resolve) => {
    t.oncomplete = () => resolve()
  })
}

export async function markMessagesDirty(ids: string[], patch: Partial<MailMessage>): Promise<void> {
  if (!ids.length) return
  const db = await openDb()
  const readTx = db.transaction("messages", "readonly")
  const readStore = readTx.objectStore("messages")
  const loaded = await Promise.all(ids.map((id) => new Promise<StoredMessage | null>((resolve) => {
    const req = readStore.get(id)
    req.onsuccess = () => resolve((req.result as StoredMessage) ?? null)
    req.onerror = () => resolve(null)
  })))
  const t = db.transaction("messages", "readwrite")
  const store = t.objectStore("messages")
  for (const s of loaded) {
    if (!s) continue
    const next = { ...s, ...patch, updatedAt: Date.now() } as StoredMessage
    store.put(next)
  }
  await new Promise<void>((resolve) => {
    t.oncomplete = () => resolve()
  })
}

// --- Attachments ---

export async function saveAttachment(att: { id: string; filename: string; mimeType: string; size: number; dataBase64: string }): Promise<void> {
  const encData = await encryptWithDeviceKey(att.dataBase64)
  await tx("attachments", "readwrite", (s) =>
    s.put({ id: att.id, filename: att.filename, mimeType: att.mimeType, size: att.size, dataEnc: encData })
  )
}

export async function loadAttachment(id: string): Promise<{ dataBase64: string } | null> {
  const rec = await tx<any>("attachments", "readonly", (s) => s.get(id))
  if (!rec) return null
  const dataBase64 = (await decryptWithDeviceKey(rec.dataEnc)) || ""
  return { dataBase64 }
}

export async function deleteAttachments(ids: string[]): Promise<void> {
  const db = await openDb()
  const t = db.transaction("attachments", "readwrite")
  const store = t.objectStore("attachments")
  for (const id of ids) store.delete(id)
  await new Promise<void>((resolve) => {
    t.oncomplete = () => resolve()
  })
}

// --- Misc ---

export async function clearAll(): Promise<void> {
  const db = await openDb()
  for (const name of ["kv", "accounts", "messages", "attachments"]) {
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(name, "readwrite").objectStore(name).clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }
}

export { randomId }