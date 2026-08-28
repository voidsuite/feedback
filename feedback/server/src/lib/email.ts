/**
 * Minimal SMTP sender (nodemailer) for the email notification source.
 * If SMTP isn't configured, sending is a no-op so the app still runs locally.
 */

import nodemailer from "nodemailer"
import config from "../config.js"

let transporter: nodemailer.Transporter | null = null
let checked = false

function getTransporter(): nodemailer.Transporter | null {
  if (checked) return transporter
  checked = true
  const { host, port, secure, user, pass } = config.smtp
  if (!host || !user) return null
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  })
  return transporter
}

export function emailConfigured(): boolean {
  return getTransporter() !== null
}

export interface EmailOptions {
  to: string
  subject: string
  html: string
  text: string
}

export async function sendEmail(opts: EmailOptions): Promise<boolean> {
  const t = getTransporter()
  if (!t) return false
  try {
    await t.sendMail({
      from: config.smtp.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    })
    return true
  } catch (err) {
    console.error("[email] send failed", err)
    return false
  }
}
