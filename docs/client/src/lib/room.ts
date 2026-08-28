/**
 * Yjs document hook — owns the Y.Doc, encrypted local persistence,
 * the encrypted relay provider, the undo manager and awareness (live
 * presence) for one document. The TipTap editor binds to `getDoc()`.
 */

import * as React from "react"
import * as Y from "yjs"
import { Awareness } from "y-protocols/awareness"
import { EncryptedRoomProvider, type RoomStatus } from "./ws-provider"
import { b64UrlToKey, decryptBytesWithKey, encryptBytesWithKey } from "./crypto"
import { appendDocUpdate, loadDocUpdates } from "./db"

export interface PresenceUser {
  clientId: number
  name?: string
  color?: string
}

export interface DocRoom {
  ready: boolean
  status: RoomStatus
  version: number
  presence: PresenceUser[]
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  setLocalState: (state: { name?: string; color?: string }) => void
  getDoc: () => Y.Doc
  getAwareness: () => Awareness
  /** The AES-GCM document key (used for version snapshots + sharing). */
  getKey: () => CryptoKey | null
}

/**
 * Encrypted local persistence for one doc. Every Yjs update is AES-GCM'd
 * with the doc key before landing in IndexedDB; on load all updates are
 * replayed (Yjs merges idempotently, order does not matter).
 */
class EncryptedIndexeddbPersistence {
  private docId: string
  private doc: Y.Doc
  private key: CryptoKey
  private onUpdate: (update: Uint8Array, origin: unknown) => void
  private loading = true

  constructor(docId: string, doc: Y.Doc, key: CryptoKey) {
    this.docId = docId
    this.doc = doc
    this.key = key
    this.onUpdate = (update, origin) => {
      if (origin === "encdb" || this.loading) return
      void encryptBytesWithKey(update, this.key)
        .then((enc) => appendDocUpdate(this.docId, enc))
        .catch(() => {})
    }
    this.doc.on("update", this.onUpdate)
    void this.load()
  }

  private async load() {
    this.loading = true
    try {
      const updates = await loadDocUpdates(this.docId)
      for (const enc of updates) {
        try {
          const plain = await decryptBytesWithKey(enc, this.key)
          Y.applyUpdate(this.doc, plain, "encdb")
        } catch {
          // wrong key or corrupted — skip this update
        }
      }
    } catch {
      /* storage unavailable */
    } finally {
      this.loading = false
    }
  }

  destroy() {
    this.doc.off("update", this.onUpdate)
  }
}

export function useYjsDoc(opts: {
  enabled: boolean
  docId: string
  /** Raw base64url document key (already unwrapped from the vault). */
  docKeyB64: string
  userName: string
  userColor: string
  /**
   * Whether to open the encrypted relay. The relay requires a gateway
   * session, so it should be off while signed out (otherwise the rejected
   * upgrade reconnects forever). Defaults to true.
   */
  collabEnabled?: boolean
}): DocRoom {
  const { enabled, docId, docKeyB64, userName, userColor, collabEnabled = true } = opts
  const ref = React.useRef<{
    key: CryptoKey | null
    doc: Y.Doc
    awareness: Awareness
    provider: EncryptedRoomProvider | null
    persistence: EncryptedIndexeddbPersistence | null
    undo: Y.UndoManager | null
  } | null>(null)

  const [ready, setReady] = React.useState(false)
  const [status, setStatus] = React.useState<RoomStatus>("offline")
  const [docVersion, setDocVersion] = React.useState(0)
  const [awareVersion, setAwareVersion] = React.useState(0)
  const [canUndo, setCanUndo] = React.useState(false)
  const [canRedo, setCanRedo] = React.useState(false)

  // Create / tear down the room when the document changes.
  React.useEffect(() => {
    if (!enabled) return
    const doc = new Y.Doc()
    const awareness = new Awareness(doc)
    awareness.setLocalState({ name: userName, color: userColor })

    let provider: EncryptedRoomProvider | null = null
    let persistence: EncryptedIndexeddbPersistence | null = null
    let undo: Y.UndoManager | null = null
    let disposed = false

    const onDocUpdate = () => setDocVersion((v) => v + 1)
    const onAwareUpdate = () => setAwareVersion((v) => v + 1)
    doc.on("update", onDocUpdate)
    awareness.on("update", onAwareUpdate)

    const markUndo = () => {
      setCanUndo(undo?.canUndo() ?? false)
      setCanRedo(undo?.canRedo() ?? false)
    }

    setReady(false)
    b64UrlToKey(docKeyB64)
      .then((key) => {
        if (disposed) {
          doc.destroy()
          awareness.destroy()
          return
        }
        persistence = new EncryptedIndexeddbPersistence(docId, doc, key)
        undo = new Y.UndoManager(doc.getXmlFragment("default"), { captureTimeout: 350 })
        undo.on("stack-item-added", markUndo)
        undo.on("stack-item-popped", markUndo)
        provider = new EncryptedRoomProvider({ docId, key, doc, awareness, onStatus: setStatus })
        // Respect the current sign-in state immediately (constructor would
        // connect by default even when collab is disabled).
        provider.setEnabled(collabEnabled)
        ref.current = { key, doc, awareness, provider, persistence, undo }
        setReady(true)
      })
      .catch(() => setStatus("error"))

    return () => {
      disposed = true
      setReady(false)
      setStatus("offline")
      provider?.disconnect()
      doc.off("update", onDocUpdate)
      awareness.off("update", onAwareUpdate)
      undo?.destroy()
      awareness.destroy()
      persistence?.destroy()
      doc.destroy()
      ref.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, docId, docKeyB64])

  // Open / close the encrypted relay when sign-in state changes — no room
  // teardown, local persistence stays untouched.
  React.useEffect(() => {
    ref.current?.provider?.setEnabled(collabEnabled)
  }, [collabEnabled])

  // Keep awareness identity in sync.
  React.useEffect(() => {
    ref.current?.awareness.setLocalStateField("name", userName)
    ref.current?.awareness.setLocalStateField("color", userColor)
  }, [userName, userColor])

  const presence = React.useMemo(() => {
    if (!ref.current) return []
    const localId = ref.current.awareness.clientID
    const out: PresenceUser[] = []
    for (const [clientId, state] of ref.current.awareness.getStates().entries()) {
      if (clientId === localId) continue
      const s = state as Record<string, unknown>
      out.push({
        clientId,
        name: typeof s.name === "string" ? s.name : undefined,
        color: typeof s.color === "string" ? s.color : undefined,
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awareVersion, ref.current])

  return React.useMemo<DocRoom>(
    () => ({
      ready,
      status,
      version: docVersion,
      presence,
      undo: () => ref.current?.undo?.undo(),
      redo: () => ref.current?.undo?.redo(),
      canUndo,
      canRedo,
      setLocalState: (state) => {
        if (state.name !== undefined) ref.current?.awareness.setLocalStateField("name", state.name)
        if (state.color !== undefined) ref.current?.awareness.setLocalStateField("color", state.color)
      },
      getKey: () => ref.current?.key ?? null,
      getDoc: () => {
        if (!ref.current) throw new Error("Room not ready")
        return ref.current.doc
      },
      getAwareness: () => {
        if (!ref.current) throw new Error("Room not ready")
        return ref.current.awareness
      },
    }),
    [ready, status, presence, docVersion, canUndo, canRedo]
  )
}