/**
 * Pragmatic MIME parser (RFC 2822 + MIME) — enough for a v1 mail client:
 * folded headers, RFC 2047 encoded words, multipart/*, base64 &
 * quoted-printable transfer encodings, and attachment extraction.
 * It favours tolerance over strictness (real-world mail is messy).
 */

import type { ParsedAddress, ParsedAttachment, ParsedMessage } from "../types.js"

const encoder = new TextEncoder()

// --- Header utilities ---

/** Decode bytes with an explicit charset (UTF-8 or Latin-1). */
function textDecode(bytes: Uint8Array, charset: "utf-8" | "latin1"): string {
  if (charset === "latin1") {
    let out = ""
    for (const b of bytes) out += String.fromCharCode(b)
    return out
  }
  return new TextDecoder("utf-8").decode(bytes)
}

function decodeRfc2047Word(word: string): string {
  // =?charset?B?base64?=  or  =?charset?Q?encoded?=
  const m = /^=\?([^?]+)\?([bBqQ])\?([^?]*)\?=$/.exec(word.trim())
  if (!m) return word
  const [, charset, enc, body] = m
  try {
    if (enc.toLowerCase() === "b") {
      return textDecode(new Uint8Array(Buffer.from(body, "base64")), normalizeCharset(charset))
    }
    // Q-encoding
    const q = body
      .replace(/_/g, " ")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    return textDecode(new Uint8Array(Buffer.from(q, "latin1")), normalizeCharset(charset))
  } catch {
    return word
  }
}

function normalizeCharset(charset: string): "utf-8" | "latin1" {
  const c = charset.toLowerCase().replace(/["']/g, "")
  if (c.includes("iso-8859-1") || c.includes("latin1") || c.includes("latin-1")) return "latin1"
  return "utf-8"
}

/** Decode RFC 2047 encoded-words that may be mixed with plain text. */
export function decodeEncodedWords(input: string): string {
  const tokens = input.split(/(=\?[^?]+\?[bBqQ]\?[^?]*\?=)/g)
  return tokens.map((t) => (t.startsWith("=?") ? decodeRfc2047Word(t) : t)).join("")
}

/** Split a header block into a map of lowercased key → decoded value. */
export function parseHeaders(headerBlock: string): Record<string, string> {
  const headers: Record<string, string> = {}
  const lines = headerBlock.replace(/\r\n/g, "\n").split("\n")
  let currentKey: string | null = null
  for (const rawLine of lines) {
    if (/^[ \t]/.test(rawLine) && currentKey) {
      headers[currentKey] += " " + rawLine.trim()
      continue
    }
    const idx = rawLine.indexOf(":")
    if (idx === -1) continue
    const key = rawLine.slice(0, idx).trim().toLowerCase()
    const value = rawLine.slice(idx + 1).trim()
    if (key) {
      currentKey = key
      headers[key] = value
    }
  }
  return headers
}

// --- Address parsing ---

function splitAddresses(input: string): string[] {
  const out: string[] = []
  let current = ""
  let inQuote = false
  let angleDepth = 0
  for (const ch of input) {
    if (ch === '"' && !inQuote) inQuote = true
    else if (ch === '"' && inQuote) inQuote = false
    else if (ch === "<" && !inQuote) angleDepth++
    else if (ch === ">" && !inQuote) angleDepth = Math.max(0, angleDepth - 1)
    if (ch === "," && !inQuote && angleDepth === 0) {
      out.push(current)
      current = ""
      continue
    }
    current += ch
  }
  if (current.trim()) out.push(current)
  return out.map((s) => s.trim()).filter(Boolean)
}

function parseOneAddress(input: string): ParsedAddress {
  const angle = /<([^>]+)>/.exec(input)
  if (angle) {
    const email = angle[1].trim()
    const name = decodeEncodedWords(input.replace(/<[^>]+>/, "").trim())
    return { name, email }
  }
  const trimmed = input.trim()
  return { name: "", email: trimmed.replace(/^["']|["']$/g, "") }
}

export function parseAddressList(input: string | undefined | null): ParsedAddress[] {
  if (!input) return []
  return splitAddresses(input).map(parseOneAddress).filter((a) => a.email)
}

export function parseOneAddressField(input: string | undefined | null): ParsedAddress | null {
  const list = parseAddressList(input)
  return list[0] || null
}

// --- Transfer decoding ---

function decodeBase64(data: string): Uint8Array {
  const clean = data.replace(/\s+/g, "")
  return new Uint8Array(Buffer.from(clean, "base64"))
}

function decodeQuotedPrintable(data: string): Uint8Array {
  const bytes: number[] = []
  const lines = data.split(/\r?\n/)
  for (const line of lines) {
    let i = 0
    // A trailing "=" is a soft line break — skip it.
    const end = line.endsWith("=") ? line.length - 1 : line.length
    while (i < end) {
      if (line[i] === "=" && i + 2 < line.length && /[0-9A-Fa-f]{2}/.test(line.slice(i + 1, i + 3))) {
        bytes.push(parseInt(line.slice(i + 1, i + 3), 16))
        i += 3
      } else {
        bytes.push(line.charCodeAt(i))
        i += 1
      }
    }
  }
  return new Uint8Array(bytes)
}

function decodeBody(data: string, encoding: string): Uint8Array {
  const enc = (encoding || "7bit").trim().toLowerCase()
  if (enc === "base64") return decodeBase64(data)
  if (enc === "quoted-printable") return decodeQuotedPrintable(data)
  return new Uint8Array(Buffer.from(data, "latin1"))
}

// --- Content-Type / disposition params ---

function parseContentType(value: string): { type: string; params: Record<string, string> } {
  const parts = value.split(";")
  const type = (parts[0] || "text/plain").trim().toLowerCase()
  const params: Record<string, string> = {}
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf("=")
    if (eq === -1) continue
    let key = parts[i].slice(0, eq).trim().toLowerCase().replace(/^\*+/, "")
    let val = parts[i].slice(eq + 1).trim()
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    // RFC 2231 continued params (name*0, name*1) — join and decode the first piece.
    if (key.endsWith("*")) key = key.replace(/\*$/, "")
    if (key && !(key in params)) params[key] = val
  }
  return { type, params }
}

function parseDisposition(value: string): { disposition: string; filename: string } {
  const { type, params } = parseContentType(value)
  let filename = params.filename || ""
  if (!filename && params["filename*"]) {
    // charset'lang'percent-encoded
    const raw = params["filename*"]
    const idx = raw.indexOf("''")
    const encoded = idx === -1 ? raw : raw.slice(idx + 2)
    try {
      filename = decodeURIComponent(encoded)
    } catch {
      filename = encoded
    }
  }
  return { disposition: type.split("/")[0], filename: decodeEncodedWords(filename) }
}

// --- Recursive part parsing ---

interface Part {
  headers: Record<string, string>
  body: string
}

function splitHeaderBody(raw: string): { headerBlock: string; body: string } {
  const idx = raw.indexOf("\r\n\r\n")
  if (idx === -1) {
    const nl = raw.indexOf("\n\n")
    if (nl === -1) return { headerBlock: raw, body: "" }
    return { headerBlock: raw.slice(0, nl), body: raw.slice(nl + 2) }
  }
  return { headerBlock: raw.slice(0, idx), body: raw.slice(idx + 4) }
}

function splitMultipart(body: string, boundary: string): string[] {
  const delim = `--${boundary}`
  const parts: string[] = []
  const lines = body.split(/\r\n|\n/)
  let current: string[] = []
  let started = false
  for (const line of lines) {
    if (line.startsWith(delim)) {
      const isEnd = line === `${delim}--`
      if (started) parts.push(current.join("\n"))
      current = []
      started = !isEnd
      if (isEnd) break
      continue
    }
    if (started) current.push(line)
  }
  if (started && current.length) parts.push(current.join("\n"))
  return parts
}

function sanitizeFilename(name: string): string {
  // Strip path separators to avoid weird names ending up in the UI.
  return name.replace(/[/\\]/g, "_").replace(/\0/g, "").trim() || "attachment"
}

function collectTextHtml(parts: Part[], acc: { text: string | null; html: string | null }): void {
  for (const part of parts) {
    const ct = parseContentType(part.headers["content-type"] || "text/plain")
    if (ct.type === "multipart/alternative" || ct.type === "multipart/mixed" || ct.type === "multipart/related") {
      const boundary = ct.params.boundary
      if (boundary) collectTextHtml(parseParts(part.body, boundary), acc)
      continue
    }
    const enc = part.headers["content-transfer-encoding"] || "7bit"
    const bytes = decodeBody(part.body, enc)
    const text = new TextDecoder("utf-8").decode(bytes)
    if (ct.type === "text/html" && !acc.html) acc.html = text
    else if (ct.type === "text/plain" && !acc.text) acc.text = text
  }
}

function parseParts(body: string, boundary: string): Part[] {
  return splitMultipart(body, boundary).map((raw) => {
    const { headerBlock, body: partBody } = splitHeaderBody(raw)
    return { headers: parseHeaders(headerBlock), body: partBody }
  })
}

// --- Main entry ---

export function parseMessage(raw: string, uid: string, index: number): ParsedMessage {
  const { headerBlock, body } = splitHeaderBody(raw)
  const headers = parseHeaders(headerBlock)
  const ct = parseContentType(headers["content-type"] || "text/plain")

  const text: string | null = null
  const html: string | null = null
  const attachments: ParsedAttachment[] = []

  if (ct.type.startsWith("multipart/")) {
    const boundary = ct.params.boundary
    const acc = { text, html }
    if (boundary) {
      const parts = parseParts(body, boundary)
      collectTextHtml(parts, acc)
      for (const part of parts) {
        const partCt = parseContentType(part.headers["content-type"] || "text/plain")
        const disp = parseDisposition(part.headers["content-disposition"] || "")
        const isAttachment =
          disp.disposition === "attachment" ||
          (!!disp.filename && !partCt.type.startsWith("multipart/") && !partCt.type.startsWith("text/"))
        if (isAttachment) {
          const bytes = decodeBody(part.body, part.headers["content-transfer-encoding"] || "base64")
          const filename = sanitizeFilename(disp.filename || `attachment-${attachments.length + 1}`)
          attachments.push({ filename, mimeType: partCt.type, size: bytes.length, data: bytes })
        }
      }
    }
    return {
      uid,
      index,
      headers,
      subject: decodeEncodedWords(headers.subject || "(no subject)"),
      from: parseOneAddressField(headers.from),
      to: parseAddressList(headers.to),
      cc: parseAddressList(headers.cc),
      date: parseDate(headers.date),
      text: acc.text,
      html: acc.html,
      attachments,
    }
  }

  // Single-part message.
  const enc = headers["content-transfer-encoding"] || "7bit"
  const bytes = decodeBody(body, enc)
  const content = new TextDecoder("utf-8").decode(bytes)
  const isAttachment = parseDisposition(headers["content-disposition"] || "").disposition === "attachment"

  return {
    uid,
    index,
    headers,
    subject: decodeEncodedWords(headers.subject || "(no subject)"),
    from: parseOneAddressField(headers.from),
    to: parseAddressList(headers.to),
    cc: parseAddressList(headers.cc),
    date: parseDate(headers.date),
    text: isAttachment ? null : content,
    html: null,
    attachments: isAttachment
      ? [{ filename: sanitizeFilename(parseDisposition(headers["content-disposition"]).filename), mimeType: ct.type, size: bytes.length, data: bytes }]
      : [],
  }
}

function parseDate(value: string | undefined): string | null {
  if (!value) return null
  const ts = Date.parse(value)
  return Number.isNaN(ts) ? null : new Date(ts).toISOString()
}

export function encodeUtf8ForSmtp(str: string): Uint8Array {
  return encoder.encode(str)
}