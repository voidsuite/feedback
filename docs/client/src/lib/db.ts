/**
 * IndexedDB persistence for docs.
 *
 * Trust model:
 *  - Yjs document updates are encrypted at rest with the document key
 *    (each update is AES-GCM before landing in the `doc_updates` store).
 *  - Document metadata (titles, wrapped doc keys, page settings) is
 *    encrypted under the Vault Key in the `docs` store.
 *  - Version-history snapshots are encrypted under the doc key.
 *  - Generic kv (settings) is encrypted under the device key.
 */

import { encryptStringWithKey, decryptStringWithKey } from "./crypto"
import type { DocMeta, VersionRecord } from "./types"

const DB_NAME = "vdocs"
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv")
      if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", { keyPath: "id" })
      if (!db.objectStoreNames.contains("doc_updates")) db.createObjectStore("doc_updates", { keyPath: "id" })
      if (!db.objectStoreNames.contains("versions")) db.createObjectStore("versions", { keyPath: "id" })
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

function txDone(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  effect: (s: IDBObjectStore) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction(storeName, mode)
    effect(t.objectStore(storeName))
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

// --- KV (settings, small blobs) ---

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const value = await tx<any>("kv", "readonly", (s) => s.get(key))
    return (value ?? null) as T | null
  } catch {
    return null
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await tx("kv", "readwrite", (s) => s.put(value, key))
}

export async function kvDelete(key: string): Promise<void> {
  await tx("kv", "readwrite", (s) => s.delete(key))
}

// --- Document updates (Yjs, encrypted at rest under the doc key) ---

export interface StoredUpdate {
  id: string
  payload: Uint8Array<ArrayBuffer> // iv || ciphertext
}

/** Append one Yjs update to the doc's encrypted log. */
export async function appendDocUpdate(docId: string, encPayload: Uint8Array<ArrayBuffer>): Promise<void> {
  const db = await openDb()
  const id = `${docId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
  await txDone(db, "doc_updates", "readwrite", (s) => s.put({ id, payload: encPayload }))
}

/** Append with an explicit id (used when merging cloud snapshots; dedupes). */
export async function appendDocUpdateWithId(encPayload: Uint8Array<ArrayBuffer>, id: string): Promise<void> {
  const db = await openDb()
  await txDone(db, "doc_updates", "readwrite", (s) => s.put({ id, payload: encPayload }))
}

/** Replay all Yjs updates for a doc (decrypt in caller; order-independent CRDT). */
export async function loadDocUpdates(docId: string): Promise<Uint8Array<ArrayBuffer>[]> {
  const all = await tx<StoredUpdate[]>("doc_updates", "readonly", (s) => s.getAll())
  return all
    .filter((u) => u.id.startsWith(`${docId}:`))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((u) => u.payload)
}

// --- Document metadata (encrypted under the Vault Key) ---

interface StoredDoc {
  id: string
  dataEnc: string // base64(iv||ct) of JSON.stringify(DocMeta) under VaultKey
}

export async function dbSaveDoc(meta: DocMeta, vault: CryptoKey): Promise<void> {
  const dataEnc = await encryptStringWithKey(JSON.stringify(meta), vault)
  await tx<IDBValidKey>("docs", "readwrite", (s) => s.put({ id: meta.id, dataEnc } satisfies StoredDoc))
}

/** Insert an already-encrypted metadata record as-is (cloud merge). */
export async function dbPutStoredDoc(rec: { id: string; dataEnc: string }): Promise<void> {
  await tx<IDBValidKey>("docs", "readwrite", (s) => s.put(rec satisfies StoredDoc))
}

/** Raw (still-encrypted) metadata for all docs — used by cloud sync. */
export async function dbGetAllDocsRaw(): Promise<StoredDoc[]> {
  return tx<StoredDoc[]>("docs", "readonly", (s) => s.getAll())
}

/** Raw updates for all docs — used by cloud sync. */
export async function dbGetAllUpdatesRaw(): Promise<StoredUpdate[]> {
  return tx<StoredUpdate[]>("doc_updates", "readonly", (s) => s.getAll())
}

export async function dbLoadDocs(vault: CryptoKey): Promise<DocMeta[]> {
  const all = await tx<StoredDoc[]>("docs", "readonly", (s) => s.getAll())
  const out: DocMeta[] = []
  for (const rec of all || []) {
    try {
      const json = await decryptStringWithKey(rec.dataEnc, vault)
      out.push(JSON.parse(json) as DocMeta)
    } catch {
      // skip docs we cannot unlock (vault changed / cleared)
    }
  }
  return out
}

export async function dbGetDoc(id: string, vault: CryptoKey): Promise<DocMeta | null> {
  const rec = await tx<StoredDoc | undefined>("docs", "readonly", (s) => s.get(id))
  if (!rec) return null
  try {
    const json = await decryptStringWithKey(rec.dataEnc, vault)
    return JSON.parse(json) as DocMeta
  } catch {
    return null
  }
}

export async function dbDeleteDoc(id: string): Promise<void> {
  const db = await openDb()
  await txDone(db, "docs", "readwrite", (s) => s.delete(id))
}

// --- Version history ---

export async function dbSaveVersion(rec: VersionRecord): Promise<void> {
  await tx("versions", "readwrite", (s) => s.put(rec))
}

/** All version records (used by cloud sync). */
export async function dbGetAllVersionsRaw(): Promise<VersionRecord[]> {
  return tx<VersionRecord[]>("versions", "readonly", (s) => s.getAll())
}

export async function dbLoadVersions(docId: string): Promise<VersionRecord[]> {
  const all = await tx<VersionRecord[]>("versions", "readonly", (s) => s.getAll())
  return (all || []).filter((v) => v.docId === docId).sort((a, b) => b.createdAt - a.createdAt)
}

export async function dbDeleteVersion(id: string): Promise<void> {
  await tx("versions", "readwrite", (s) => s.delete(id))
}

// --- Global ---

export async function clearAll(): Promise<void> {
  const db = await openDb()
  for (const name of ["kv", "docs", "doc_updates", "versions"]) {
    await txDone(db, name, "readwrite", (s) => s.clear())
  }
}