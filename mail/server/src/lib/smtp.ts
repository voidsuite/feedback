/**
 * SMTP sending via nodemailer. Credentials are transient (per-request),
 * never persisted or logged.
 */

import nodemailer from "nodemailer"
import type { TransportOptions } from "nodemailer"
import type { MailAccountPayload, OutboundAttachment, SendMailRequest } from "../types.js"

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024 // 20MB per attachment

function transportFor(account: MailAccountPayload) {
  const tls = account.smtp.tls
  const options: TransportOptions = {
    host: account.smtp.host,
    port: account.smtp.port || (tls === "ssl" ? 465 : 587),
    secure: tls === "ssl",
    auth: { user: account.smtp.user, pass: account.smtp.pass },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
  } as TransportOptions
  if (tls === "starttls") {
    ;(options as Record<string, unknown>).requireTLS = true
  }
  return nodemailer.createTransport(options)
}

export async function sendMail(req: SendMailRequest): Promise<{ messageId: string }> {
  const { account, to, cc, bcc, subject, text, html, attachments } = req

  if (!to?.length) throw new Error("No recipients")
  if (!subject && !text && !html) throw new Error("Message is empty")
  if (!account.smtp.host) throw new Error("SMTP host missing")

  const mailAttachments: Array<Record<string, unknown>> = []
  if (attachments?.length) {
    for (const att of attachments) {
      const buf = Buffer.from(att.contentBase64 || "", "base64")
      if (buf.length > MAX_ATTACHMENT_BYTES) {
        throw new Error(`Attachment "${att.filename}" exceeds the 20MB limit`)
      }
      mailAttachments.push({
        filename: att.filename,
        content: buf,
        contentType: att.contentType || "application/octet-stream",
      })
    }
  }

  const transport = transportFor(account)
  try {
    const info = await transport.sendMail({
      from: { name: account.label || account.name || undefined, address: account.email },
      to: to.join(", "),
      cc: cc?.length ? cc.join(", ") : undefined,
      bcc: bcc?.length ? bcc.join(", ") : undefined,
      subject: subject || "(no subject)",
      text,
      html,
      attachments: mailAttachments.length ? mailAttachments : undefined,
    })
    return { messageId: info.messageId || "" }
  } finally {
    transport.close()
  }
}

export async function testSmtp(account: MailAccountPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const transport = transportFor(account)
    try {
      await transport.verify()
      return { ok: true }
    } finally {
      transport.close()
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message || "SMTP test failed" }
  }
}