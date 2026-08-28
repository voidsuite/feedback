/**
 * Version history — auto-checkpoints + named versions + restore.
 * Snapshots are Yjs full-state updates encrypted with the doc key.
 */

import * as Y from "yjs"
import { encryptBytesWithKey, decryptBytesWithKey, randomId } from "./crypto"
import { dbSaveVersion, dbLoadVersions, dbDeleteVersion } from "./db"
import type { VersionRecord } from "./types"

const AUTO_KEEP = 50
const AUTO_MIN_GAP = 5 * 60 * 1000 // checkpoint at most once per 5 minutes
const AUTO_DEBOUNCE = 45 * 1000 // wait for 45s of quiet before writing an auto snapshot

export async function encodeSnapshot(doc: Y.Doc, docKey: CryptoKey): Promise<string> {
  const state = Y.encodeStateAsUpdate(doc)
  const enc = await encryptBytesWithKey(state, docKey)
  return btoa(String.fromCharCode(...enc))
}

export async function decodeSnapshot(snapshotB64: string, docKey: CryptoKey): Promise<Y.Doc> {
  const bytes = Uint8Array.from(atob(snapshotB64), (c) => c.charCodeAt(0))
  const plain = await decryptBytesWithKey(bytes, docKey)
  const restored = new Y.Doc()
  Y.applyUpdate(restored, plain)
  return restored
}

export async function createVersion(opts: {
  doc: Y.Doc
  docId: string
  docKey: CryptoKey
  kind: "auto" | "named"
  name?: string
  author?: string
}): Promise<VersionRecord> {
  const rec: VersionRecord = {
    id: randomId(),
    docId: opts.docId,
    kind: opts.kind,
    name: opts.name,
    author: opts.author,
    createdAt: Date.now(),
    snapshotB64: await encodeSnapshot(opts.doc, opts.docKey),
  }
  await dbSaveVersion(rec)
  return rec
}

export async function loadVersions(docId: string): Promise<VersionRecord[]> {
  return dbLoadVersions(docId)
}

export async function deleteVersion(id: string): Promise<void> {
  await dbDeleteVersion(id)
}

/** Promote an auto-checkpoint to a named version (kept forever). */
export async function renameVersion(rec: VersionRecord, name: string): Promise<void> {
  await dbSaveVersion({ ...rec, kind: "named", name })
}

/** Replace the live document with a snapshot's content (applies via Yjs transact). */
export function applyRestore(doc: Y.Doc, restored: Y.Doc): void {
  const live = doc.getXmlFragment("default")
  const source = restored.getXmlFragment("default")
  doc.transact(() => {
    live.delete(0, live.length)
    const items = source.toArray() as (Y.XmlElement | Y.XmlText)[]
    live.insert(live.length, items)
  })
}

interface AutoCheckpointer {
  start: (doc: Y.Doc, opts: { docId: string; docKey: CryptoKey }) => void
  stop: () => void
}

/**
 * Watches the document and writes automatic checkpoints: debounced 45s of
 * quiet + at most one every 5 minutes. Keeps the newest AUTO_KEEP auto
 * snapshots (named versions are never pruned).
 */
export function createAutoCheckpointer(): AutoCheckpointer {
  let doc: Y.Doc | null = null
  let opts: { docId: string; docKey: CryptoKey } | null = null
  let quietTimer: ReturnType<typeof setTimeout> | null = null
  let lastAutoAt = 0

  const onUpdate = () => {
    if (quietTimer) clearTimeout(quietTimer)
    quietTimer = setTimeout(takeAuto, AUTO_DEBOUNCE)
  }

  const takeAuto = async () => {
    quietTimer = null
    if (!doc || !opts) return
    const now = Date.now()
    if (now - lastAutoAt < AUTO_MIN_GAP) return
    try {
      await createVersion({ doc, docId: opts.docId, docKey: opts.docKey, kind: "auto" })
      lastAutoAt = now
      // prune oldest auto snapshots beyond AUTO_KEEP
      const all = await loadVersions(opts.docId)
      const autos = all.filter((v) => v.kind === "auto").sort((a, b) => b.createdAt - a.createdAt)
      for (const extra of autos.slice(AUTO_KEEP)) await deleteVersion(extra.id)
    } catch {
      /* try again on the next edit */
    }
  }

  return {
    start(d, o) {
      doc = d
      opts = o
      lastAutoAt = Date.now()
      d.on("update", onUpdate)
    },
    stop() {
      if (quietTimer) clearTimeout(quietTimer)
      quietTimer = null
      doc?.off("update", onUpdate)
      doc = null
      opts = null
    },
  }
}