/**
 * /api/mail/* — SMTP send + POP3 fetch relay.
 * Credentials arrive per-request, are used transiently, and are never stored.
 */

import { Hono } from "hono"
import { rateLimit } from "../middleware/auth.js"
import { sendMail, testSmtp } from "../lib/smtp.js"
import { fetchMessages, testPop3 } from "../lib/pop3.js"
import { logger } from "../lib/log.js"
import type { MailAccountPayload, FetchedMailMessage } from "../types.js"

const mail = new Hono()

mail.use("*", rateLimit)

function validateAccount(account: MailAccountPayload | undefined): string | null {
  if (!account || typeof account !== "object") return "Missing account"
  if (!account.email || !account.smtp?.host || !account.pop3?.host) return "Incomplete account configuration"
  return null
}

function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  // Never echo credentials back to logs or the client in full.
  return msg.slice(0, 500)
}

// POST /api/mail/send
mail.post("/send", async (c) => {
  const body = await c.req.json().catch(() => null)
  const account = body?.account as MailAccountPayload | undefined
  const invalid = validateAccount(account)
  if (invalid || !account) return c.json({ error: invalid || "Invalid account" }, 400)

  try {
    const result = await sendMail({
      account,
      to: Array.isArray(body.to) ? body.to.filter((s: unknown): s is string => typeof s === "string") : [],
      cc: Array.isArray(body.cc) ? body.cc.filter((s: unknown): s is string => typeof s === "string") : [],
      bcc: Array.isArray(body.bcc) ? body.bcc.filter((s: unknown): s is string => typeof s === "string") : [],
      subject: typeof body.subject === "string" ? body.subject : "",
      text: typeof body.text === "string" ? body.text : undefined,
      html: typeof body.html === "string" ? body.html : undefined,
      attachments: body.attachments,
    })
    return c.json(result)
  } catch (err) {
    logger.warn("mail send failed", { error: sanitizeError(err) })
    return c.json({ error: sanitizeError(err) }, 502)
  }
})

// POST /api/mail/fetch — download new messages via POP3
mail.post("/fetch", async (c) => {
  const body = await c.req.json().catch(() => null)
  const account = body?.account as MailAccountPayload | undefined
  const invalid = validateAccount(account)
  if (invalid || !account) return c.json({ error: invalid || "Invalid account" }, 400)

  const max = Math.min(Math.max(parseInt(body?.maxMessages || "50", 10) || 50, 1), 500)

  try {
    const result = await fetchMessages(account.pop3, max)
    // json() over a raw Uint8Array would produce a sparse object per attachment;
    // convert to base64 for a stable wire format.
    const messages: FetchedMailMessage[] = result.messages.map((m) => ({
      uid: m.uid,
      index: m.index,
      subject: m.subject,
      from: m.from,
      to: m.to,
      cc: m.cc,
      date: m.date,
      text: m.text,
      html: m.html,
      attachments: m.attachments.map((a) => ({
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
        dataBase64: Buffer.from(a.data).toString("base64"),
      })),
    }))
    return c.json({ messages, total: result.total, fetched: result.fetched })
  } catch (err) {
    logger.warn("mail fetch failed", { error: sanitizeError(err) })
    return c.json({ error: sanitizeError(err) }, 502)
  }
})

// POST /api/mail/test — validate SMTP + POP3 credentials
mail.post("/test", async (c) => {
  const body = await c.req.json().catch(() => null)
  const account = body?.account as MailAccountPayload | undefined
  const invalid = validateAccount(account)
  if (invalid || !account) return c.json({ error: invalid || "Invalid account" }, 400)

  const [smtpResult, pop3Result] = await Promise.all([testSmtp(account), testPop3(account.pop3)])
  return c.json({ smtp: smtpResult, pop3: pop3Result })
})

export default mail