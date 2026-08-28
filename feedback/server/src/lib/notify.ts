/**
 * Notification dispatcher. On key events (new feedback, new reply, status
 * change, assignment) every enabled notification target whose `events` include
 * the event is notified. Targets: Discord, Slack, Telegram, Email, Generic
 * Webhook. Failures are logged but never break the request.
 */

import config from "../config.js"
import { db, now } from "../db/connection.js"
import { newId } from "./ids.js"
import { sendEmail, emailConfigured } from "./email.js"

export type NotifyEvent = "new_feedback" | "new_reply" | "status_change" | "assigned"

export interface NotifyThread {
  id: string
  type: string
  title: string
  source_app: string | null
  status: string
  author_name: string
}

export interface NotifyContext {
  thread: NotifyThread
  message?: { body: string; author_name: string; author_role: string }
  actor?: { name: string }
  /** email address of the thread author, if we should also notify them */
  author_email?: string
}

const TYPE_LABEL: Record<string, string> = {
  question: "Question",
  feature: "Feature request",
  bug: "Bug report",
  support: "Support chat",
}

const STATUS_COLOR: Record<string, number> = {
  open: 0x6b7280,
  in_review: 0xf59e0b,
  planned: 0x8b5cf6,
  in_progress: 0x3b82f6,
  answered: 0x10b981,
  shipped: 0x22c55e,
  closed: 0x374151,
}

const EVENT_TITLE: Record<NotifyEvent, string> = {
  new_feedback: "New feedback",
  new_reply: "New reply",
  status_change: "Status changed",
  assigned: "Assigned",
}

interface TargetRow {
  id: string
  type: string
  name: string
  config: string
  events: string
}

function threadUrl(id: string): string {
  return `${config.publicUrl}/thread/${id}`
}

function plainBody(ctx: NotifyContext): string {
  const t = ctx.thread
  const head = `${EVENT_TITLE[Object.keys(EVENT_TITLE)[0] as NotifyEvent] ?? ""}`
  const lines = [
    `${TYPE_LABEL[t.type] ?? t.type} · ${t.title}`,
    `From: ${t.author_name}${t.source_app ? ` (via ${t.source_app})` : ""}`,
    `Status: ${t.status}`,
  ]
  if (ctx.message) {
    lines.push("")
    lines.push(`${ctx.message.author_name} (${ctx.message.author_role}): ${ctx.message.body}`)
  }
  lines.push("")
  lines.push(threadUrl(t.id))
  return lines.join("\n")
}

function buildDiscord(ctx: NotifyContext, event: NotifyEvent): Record<string, unknown> {
  const t = ctx.thread
  const description = ctx.message ? `**${ctx.message.author_name}** (${ctx.message.author_role}):\n${ctx.message.body}` : undefined
  return {
    embeds: [
      {
        title: `${EVENT_TITLE[event]}: ${t.title}`,
        url: threadUrl(t.id),
        description,
        color: STATUS_COLOR[t.status] ?? 0x6b7280,
        fields: [
          { name: "Type", value: TYPE_LABEL[t.type] ?? t.type, inline: true },
          { name: "Status", value: t.status, inline: true },
          { name: "Source", value: t.source_app ?? "web", inline: true },
          { name: "Author", value: t.author_name, inline: true },
        ],
        footer: { text: "Void Feedback" },
      },
    ],
  }
}

function buildSlack(ctx: NotifyContext, event: NotifyEvent): Record<string, unknown> {
  const t = ctx.thread
  const text = ctx.message
    ? `*${EVENT_TITLE[event]}* — <${threadUrl(t.id)}|${t.title}>\n*${ctx.message.author_name}* (${ctx.message.author_role}): ${ctx.message.body}`
    : `*${EVENT_TITLE[event]}* — <${threadUrl(t.id)}|${t.title}>\nType: ${TYPE_LABEL[t.type] ?? t.type} · Status: ${t.status} · From: ${t.author_name}`
  return { text }
}

function buildTelegram(ctx: NotifyContext, event: NotifyEvent): string {
  const t = ctx.thread
  const text = ctx.message
    ? `*${EVENT_TITLE[event]}* — ${t.title}\n${ctx.message.author_name} (${ctx.message.author_role}): ${ctx.message.body}\n${threadUrl(t.id)}`
    : `*${EVENT_TITLE[event]}* — ${t.title}\nType: ${TYPE_LABEL[t.type] ?? t.type} · Status: ${t.status} · From: ${t.author_name}\n${threadUrl(t.id)}`
  return text
}

function buildWebhookPayload(ctx: NotifyContext, event: NotifyEvent): Record<string, unknown> {
  return {
    event,
    thread: ctx.thread,
    message: ctx.message,
    actor: ctx.actor,
    url: threadUrl(ctx.thread.id),
  }
}

function buildEmail(ctx: NotifyContext, event: NotifyEvent): { subject: string; html: string; text: string } {
  const t = ctx.thread
  const subject = `${EVENT_TITLE[event]}: ${t.title}`
  const text = plainBody(ctx)
  const html = `
  <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;">
    <h2 style="font-size:16px;margin:0 0 8px;">${EVENT_TITLE[event]}: ${escapeHtml(t.title)}</h2>
    <p style="color:#6b7280;font-size:13px;margin:0 0 12px;">
      ${TYPE_LABEL[t.type] ?? t.type} · status: ${t.status} · from: ${escapeHtml(t.author_name)}${t.source_app ? ` (via ${escapeHtml(t.source_app)})` : ""}
    </p>
    ${ctx.message ? `<div style="background:#f4f4f5;border-radius:8px;padding:10px 12px;font-size:14px;">${escapeHtml(ctx.message.body)}</div>` : ""}
    <p style="margin:14px 0 0;"><a href="${threadUrl(t.id)}" style="color:#2563eb;">Open in Void Feedback →</a></p>
  </div>`
  return { subject, html, text }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
}

async function sendToTarget(target: TargetRow, ctx: NotifyContext, event: NotifyEvent): Promise<{ ok: boolean; error?: string }> {
  let cfg: Record<string, unknown> = {}
  try {
    cfg = JSON.parse(target.config || "{}")
  } catch {
    cfg = {}
  }
  let outcome: { ok: boolean; error?: string } = { ok: true }
  const logOk = (ok: boolean, error?: string) => {
    outcome = { ok, error }
    db.query(
      "INSERT INTO notification_log (id, target_id, event, thread_id, ok, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(newId("nl"), target.id, event, ctx.thread.id, ok ? 1 : 0, error ?? null, now())
    return outcome
  }

  try {
    if (target.type === "discord") {
      const url = cfg.webhook_url as string
      if (!url) return logOk(false, "missing webhook_url")
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildDiscord(ctx, event)) })
      logOk(res.ok, res.ok ? undefined : `HTTP ${res.status}`)
    } else if (target.type === "slack") {
      const url = cfg.webhook_url as string
      if (!url) return logOk(false, "missing webhook_url")
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildSlack(ctx, event)) })
      logOk(res.ok, res.ok ? undefined : `HTTP ${res.status}`)
    } else if (target.type === "telegram") {
      const token = cfg.bot_token as string
      const chatId = cfg.chat_id as string
      if (!token || !chatId) return logOk(false, "missing bot_token/chat_id")
      const url = `https://api.telegram.org/bot${token}/sendMessage`
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: buildTelegram(ctx, event), parse_mode: "Markdown" }),
      })
      logOk(res.ok, res.ok ? undefined : `HTTP ${res.status}`)
    } else if (target.type === "email") {
      if (!emailConfigured()) return logOk(false, "smtp not configured")
      const to = (cfg.email as string) || ctx.author_email
      if (!to) return logOk(false, "no recipient")
      const { subject, html, text } = buildEmail(ctx, event)
      const ok = await sendEmail({ to, subject, html, text })
      logOk(ok, ok ? undefined : "send failed")
    } else if (target.type === "webhook") {
      const url = cfg.url as string
      if (!url) return logOk(false, "missing url")
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildWebhookPayload(ctx, event)),
      })
      logOk(res.ok, res.ok ? undefined : `HTTP ${res.status}`)
    }
  } catch (err) {
    logOk(false, (err as Error).message)
  }
  return outcome
}

/** Send a test notification to a single target (admin "Test" button). */
export async function testTarget(targetId: string): Promise<{ ok: boolean; error?: string }> {
  const row = db.query("SELECT id, type, name, config, events FROM notification_targets WHERE id = ?").get(targetId) as TargetRow | null
  if (!row) return { ok: false, error: "Target not found" }
  const ctx: NotifyContext = {
    thread: { id: "test", type: "feature", title: "Test notification from Void Feedback", source_app: "test", status: "open", author_name: "Void Feedback" },
    message: { body: "This is a test message. If you can read this, notifications are working 🎉", author_name: "Void Feedback", author_role: "system" },
  }
  return sendToTarget(row, ctx, "new_feedback")
}

/** Notify all enabled targets subscribed to `event`. */
export async function notify(event: NotifyEvent, ctx: NotifyContext): Promise<void> {
  const targets = db.query("SELECT id, type, name, config, events FROM notification_targets WHERE enabled = 1").all() as TargetRow[]
  const relevant = targets.filter((t) => {
    try {
      const evs = JSON.parse(t.events || "[]") as string[]
      return evs.includes(event)
    } catch {
      return true
    }
  })
  await Promise.all(relevant.map((t) => sendToTarget(t, ctx, event)))
}

/** Notify the thread author directly (two-way notifications). */
export async function notifyAuthor(event: NotifyEvent, ctx: NotifyContext): Promise<void> {
  if (!ctx.author_email) return
  if (!emailConfigured()) return
  const { subject, html, text } = buildEmail(ctx, event)
  await sendEmail({ to: ctx.author_email, subject, html, text })
}
