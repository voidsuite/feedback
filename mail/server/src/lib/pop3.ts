/**
 * Minimal POP3 client built on Bun.connect (TCP + TLS).
 *
 * Protocol notes:
 *  - Commands end with CRLF; responses are `+OK` / `-ERR`.
 *  - Multi-line responses (UIDL, TOP, RETR) end with a line containing only `.`
 *    (dot-stuffed: lines beginning with `..` represent a single leading dot).
 *  - Implicit TLS (port 995) when tls === "ssl"; otherwise plain TCP.
 *
 * Credentials are transient — constructed per request and discarded.
 */

import type { Socket } from "bun"
import type { MailServerConfig } from "../types.js"
import { parseMessage } from "./mime.js"
import type { ParsedMessage } from "../types.js"

const CONNECT_TIMEOUT = 20_000
const COMMAND_TIMEOUT = 30_000
const MAX_MESSAGE_BYTES = 20 * 1024 * 1024 // refuse messages larger than 20MB

interface LineWaiter {
  resolve: (line: string) => void
  reject: (err: Error) => void
}

export class Pop3Error extends Error {}

export class Pop3Client {
  private host: string
  private port: number
  private tls: boolean
  private user: string
  private pass: string

  private socket: Socket | null = null
  private buffer = ""
  private waiters: LineWaiter[] = []
  private closed = false
  private closeError: Error | null = null

  constructor(cfg: MailServerConfig) {
    this.host = cfg.host
    this.port = cfg.port || (cfg.tls === "ssl" ? 995 : 110)
    this.tls = cfg.tls === "ssl"
    this.user = cfg.user
    this.pass = cfg.pass
  }

  async connect(): Promise<void> {
    const socketPromise = Bun.connect({
      hostname: this.host,
      port: this.port,
      tls: this.tls,
      socket: {
        data: (_sock, data) => this.onData(data),
        close: () => this.onClose(),
        error: (_sock, err) => this.onError(new Error(typeof err === "string" ? err : String(err))),
      },
    })

    this.socket = await withTimeout(socketPromise, CONNECT_TIMEOUT, `Could not connect to ${this.host}:${this.port}`)

    const greeting = await this.readLine()
    if (!greeting.startsWith("+OK")) {
      this.close()
      throw new Pop3Error(greeting || "Connection refused")
    }
  }

  private onData(data: Uint8Array) {
    this.buffer += Buffer.from(data).toString("utf-8")
    this.pump()
  }

  private onClose() {
    this.closed = true
    if (this.closeError) this.failWaiters(this.closeError)
    else this.failWaiters(new Pop3Error("POP3 connection closed"))
  }

  private onError(err: Error) {
    this.closeError = err
    this.failWaiters(err)
  }

  private failWaiters(err: Error) {
    for (const w of this.waiters.splice(0)) w.reject(err)
  }

  private pump() {
    while (this.waiters.length && this.buffer.includes("\r\n")) {
      const idx = this.buffer.indexOf("\r\n")
      const line = this.buffer.slice(0, idx)
      this.buffer = this.buffer.slice(idx + 2)
      this.waiters.shift()!.resolve(line)
    }
  }

  private readLine(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolve)
        if (idx !== -1) this.waiters.splice(idx, 1)
        reject(new Pop3Error("POP3 command timed out"))
      }, COMMAND_TIMEOUT)
      this.waiters.push({
        resolve: (line) => {
          clearTimeout(timer)
          resolve(line)
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        },
      })
      this.pump()
    })
  }

  private write(cmd: string): void {
    if (!this.socket) throw new Pop3Error("Not connected")
    this.socket.write(`${cmd}\r\n`)
  }

  private async command(cmd: string): Promise<string> {
    this.write(cmd)
    const line = await this.readLine()
    if (line.startsWith("-ERR")) {
      throw new Pop3Error(line.slice(5).trim() || "POP3 error")
    }
    return line
  }

  private async commandMultiLine(cmd: string): Promise<string[]> {
    const first = await this.command(cmd) // +OK or throw
    const lines: string[] = []
    while (true) {
      const line = await this.readLine()
      if (line === ".") break
      // Un-dot-stuff
      lines.push(line.startsWith("..") ? line.slice(1) : line)
    }
    return lines
  }

  async login(): Promise<void> {
    await this.command(`USER ${this.user}`)
    await this.command(`PASS ${this.pass}`)
  }

  async stat(): Promise<{ count: number; size: number }> {
    const line = await this.command("STAT")
    const parts = line.split(" ")
    const count = parseInt(parts[1] || "0", 10)
    const size = parseInt(parts[2] || "0", 10)
    return { count, size }
  }

  /** Map of message index → UID string. */
  async uidl(): Promise<Map<number, string>> {
    const lines = await this.commandMultiLine("UIDL")
    const map = new Map<number, string>()
    for (const line of lines) {
      const m = /^(\d+)\s+(\S+)/.exec(line)
      if (m) map.set(parseInt(m[1], 10), m[2])
    }
    return map
  }

  /** Fetch a single message body (raw) by index. */
  async retr(index: number): Promise<string> {
    const lines = await this.commandMultiLine(`RETR ${index}`)
    const raw = lines.join("\r\n")
    if (Buffer.byteLength(raw, "utf-8") > MAX_MESSAGE_BYTES) {
      throw new Pop3Error("Message exceeds the 20MB download limit")
    }
    return raw
  }

  /** Fetch only headers (TOP n 0). Returns raw header block. */
  async top(index: number): Promise<string> {
    const lines = await this.commandMultiLine(`TOP ${index} 0`)
    return lines.join("\r\n")
  }

  async dele(index: number): Promise<void> {
    await this.command(`DELE ${index}`)
  }

  async quit(): Promise<void> {
    try {
      if (!this.closed) await this.command("QUIT")
    } catch {
      /* ignore */
    } finally {
      this.close()
    }
  }

  close(): void {
    this.closed = true
    try {
      ;(this.socket as any)?.end?.()
    } catch {
      /* ignore */
    }
    try {
      ;(this.socket as any)?.close?.()
    } catch {
      /* ignore */
    }
    this.failWaiters(new Pop3Error("POP3 connection closed"))
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Pop3Error(message)), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e instanceof Pop3Error ? e : new Pop3Error(message))
      }
    )
  })
}

export interface FetchResult {
  messages: ParsedMessage[]
  total: number
  fetched: number
}

/**
 * Fetch up to `max` messages from the mailbox.
 * Always returns the newest `max` by server index (POP3 delivers in arrival
 * order, so the highest indices are the newest arrivals).
 */
export async function fetchMessages(cfg: MailServerConfig, max = 50): Promise<FetchResult> {
  const client = new Pop3Client(cfg)
  const parsed: ParsedMessage[] = []
  try {
    await client.connect()
    await client.login()
    const { count } = await client.stat()
    if (count === 0) return { messages: [], total: 0, fetched: 0 }

    const uids = await client.uidl()
    const limit = Math.min(max, count)
    const start = Math.max(1, count - limit + 1)

    for (let i = start; i <= count; i++) {
      const raw = await client.retr(i)
      const uid = uids.get(i) || String(i)
      parsed.push(parseMessage(raw, uid, i))
    }
    return { messages: parsed, total: count, fetched: parsed.length }
  } finally {
    client.quit()
  }
}

export async function testPop3(cfg: MailServerConfig): Promise<{ ok: boolean; error?: string }> {
  const client = new Pop3Client(cfg)
  try {
    await client.connect()
    await client.login()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message || "POP3 test failed" }
  } finally {
    client.quit()
  }
}