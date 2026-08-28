/**
 * Encrypted WebSocket provider for Yjs (Void Docs).
 *
 * Frames on the wire: [type][iv(12)][ciphertext]. Everything except the
 * 1-byte type is AES-GCM encrypted with the document key, so the relay only
 * ever sees opaque blobs. Includes the full doc state exchange (SYNC1/2)
 * and awareness (live cursors) — all encrypted the same way.
 */

import * as Y from "yjs"
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness"
import { encryptBytesWithKey, decryptBytesWithKey } from "./crypto"
import { openRelaySocket } from "./api"

const FRAME_SYNC1 = 0x01
const FRAME_SYNC2 = 0x02
const FRAME_UPDATE = 0x03
const FRAME_AWARENESS = 0x04

export type RoomStatus = "connecting" | "online" | "offline" | "error"

interface ProviderOptions {
  docId: string
  key: CryptoKey
  doc: Y.Doc
  awareness: Awareness
  onStatus?: (status: RoomStatus) => void
}

export class EncryptedRoomProvider {
  private ws: WebSocket | null = null
  private closed = false
  private enabled = true
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private updateHandler: (update: Uint8Array, origin: unknown) => void
  private awarenessHandler: (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => void
  private opts: ProviderOptions

  readonly doc: Y.Doc
  readonly awareness: Awareness
  status: RoomStatus = "connecting"

  /** TipTap's Collaboration extension reads `provider.document`. */
  get document(): Y.Doc {
    return this.doc
  }

  constructor(opts: ProviderOptions) {
    this.opts = opts
    this.doc = opts.doc
    this.awareness = opts.awareness
    this.updateHandler = (update, origin) => {
      if (origin === this) return
      void this.sendEncrypted(FRAME_UPDATE, update)
    }
    this.awarenessHandler = (changes, origin) => {
      if (origin === this) return
      const ids = Array.from(changes.added).concat(Array.from(changes.updated))
      if (!ids.length) return
      const enc = encodeAwarenessUpdate(this.awareness, ids)
      void this.sendEncrypted(FRAME_AWARENESS, enc)
    }
    this.doc.on("update", this.updateHandler)
    this.awareness.on("update", this.awarenessHandler)
    this.connect()
  }

  /**
   * Start / stop relay attempts without tearing down the local room.
   * The relay requires a gateway session, so it's disabled while signed out;
   * otherwise each rejected upgrade turns into an endless 2s reconnect loop.
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (enabled) {
      if (!this.ws) this.connect()
      return
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
      this.ws = null
    }
    this.setStatus("offline")
  }

  private connect() {
    if (this.closed || !this.enabled) return
    this.setStatus("connecting")
    let ws: WebSocket
    try {
      ws = openRelaySocket(this.opts.docId)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws
    ws.binaryType = "arraybuffer"

    ws.onopen = () => {
      this.setStatus("online")
      // Announce ourselves so existing peers see our name/color immediately.
      try {
        const enc = encodeAwarenessUpdate(this.awareness, [this.awareness.clientID])
        void this.sendEncrypted(FRAME_AWARENESS, enc)
      } catch {
        /* awareness unavailable */
      }
    }
    ws.onmessage = (ev: MessageEvent) => {
      void this.handleMessage(ev)
    }
    ws.onclose = () => {
      this.ws = null
      if (!this.closed) {
        this.setStatus("offline")
        this.scheduleReconnect()
      }
    }
    ws.onerror = () => {
      ws.close()
    }
  }

  private async handleMessage(ev: MessageEvent) {
    const frame = new Uint8Array(ev.data as ArrayBuffer)
    if (!frame.length) return
    const type = frame[0]
    const payload = frame.slice(1)
    try {
      const plain = await decryptBytesWithKey(payload, this.opts.key)
      if (type === FRAME_SYNC1) {
        void this.sendEncrypted(FRAME_SYNC2, Y.encodeStateAsUpdate(this.doc))
      } else if (type === FRAME_SYNC2 || type === FRAME_UPDATE) {
        Y.applyUpdate(this.doc, plain, this)
      } else if (type === FRAME_AWARENESS) {
        applyAwarenessUpdate(this.awareness, plain, this)
      }
    } catch {
      /* undecryptable frame (wrong key / corrupted) — drop it */
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.closed || !this.enabled) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 2000)
  }

  private setStatus(status: RoomStatus) {
    this.status = status
    this.opts.onStatus?.(status)
  }

  private async sendEncrypted(type: number, data: Uint8Array) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    try {
      const enc = await encryptBytesWithKey(data, this.opts.key)
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      const frame = new Uint8Array(1 + enc.length)
      frame[0] = type
      frame.set(enc, 1)
      this.ws.send(frame.buffer)
    } catch {
      /* ignore */
    }
  }

  disconnect() {
    this.closed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.doc.off("update", this.updateHandler)
    this.awareness.off("update", this.awarenessHandler)
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }
}