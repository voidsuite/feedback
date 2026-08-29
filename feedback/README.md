# voidfeedback — Void Feedback

**A support & feedback hub for the VoidSuite family.** Submit **questions**, **feature
suggestions**, and **bug reports** — each with a **live admin chat** — plus a separate
real-time **Support lobby**. Admins (from VoidAuth) triage, reply live, and get notified via
**Discord, Slack, Telegram, Email, Generic Webhook, and in-app**.

> Built as a standalone "voidapp" that mirrors the others (board, docs, mail, 2fa): its own
> client + server, signing in with VoidAuth via OAuth 2.0 + PKCE. Feedback data lives in the
> app's own SQLite database; VoidAuth remains the source of truth for users and the `admin` role.

## Highlights

| Feature | How it works |
| --- | --- |
| Sign in with VoidAuth | OAuth 2.0 + PKCE against VoidAuth — the gateway mints an httpOnly session cookie. |
| Submit feedback | Questions / feature requests / bug reports, with live Markdown editing (split-pane editor + preview) and a source app. |
| Live admin chat | Every thread is a real-time chat room (authenticated WebSocket); admins and users exchange Markdown-formatted replies with a live preview. |
| Support lobby | A separate real-time space for instant help; users see when admins are online. |
| Admin panel | Dashboard, filterable inbox, per-thread controls, notifications, per-app stats. |
| Notifications | Discord / Slack / Telegram / Email / Webhook / in-app on new feedback, replies, status & assignment. |
| Public roadmap | Feature requests can be public and voted on, shown in a status pipeline (Planned → Shipped). |
| Internal notes | Admins can leave Markdown-formatted notes invisible to the user. |
| Markdown editing | Both the issue body (admin can edit) and all replies use a shared MarkdownEditor with split-pane live preview. |
| `?source=` prefill | Links from other Void apps deep-link with `?source=<app>`, prefilling the origin. |

## Other VoidSuite apps

| App | What it is | Repo |
| --- | --- | --- |
| [Board](https://github.com/voidsuite/board) | Kanban project boards with real-time multiplayer | `voidsuite/board` |
| [2FA](https://github.com/voidsuite/2fa) | Encrypted, cloud-synced TOTP authenticator | `voidsuite/2fa` |
| [Docs](https://github.com/voidsuite/docs) | End-to-end encrypted collaborative editor | `voidsuite/docs` |
| [Mail](https://github.com/voidsuite/mail) | Web mail client for SMTP/POP3 | `voidsuite/mail` |
| [VoidAuth](https://github.com/voidsuite/client) | Central OAuth / OIDC + identity server | `voidsuite/client` + `voidsuite/server` |

## Architecture

```
client/   Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui (Base UI)
server/   Bun + Hono gateway: VoidAuth session, REST API, SQLite store, WebSocket push
```

- Client :5179 · gateway :3009 · SQLite at `server/data/voidfeedback.db` (auto-migrated on boot).
- Auth mode: `backend` (gateway PKCE proxy) — recommended.

## Getting started

Requires [Bun](https://bun.sh) ≥ 1.2.

```bash
cp .env.example .env        # fill in values (see below)
bun --cwd server dev        # or: cd server && bun dev
# in another shell:
bun --cwd client dev        # client :5179 -> proxies /api to gateway :3009
```

Open the client, sign in with VoidAuth, and submit feedback.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `VOIDAUTH_URL` | VoidAuth issuer (prod `https://auth.stwupid.tech`). |
| `VOIDFEEDBACK_CLIENT_ID` / `VOIDFEEDBACK_CLIENT_SECRET` | OAuth client for voidfeedback (backend mode). |
| `APP_URL` | Public app URL (OAuth redirect, CORS, secure cookies). |
| `PORT` | Gateway port (default `3009`). |
| `DATA_DIR` | Where the SQLite db lives. |
| `SMTP_*` | Optional — enables the email notification source. |

### Registering the OAuth client

The VoidAuth seed already includes a `voidfeedback` client (scopes `openid profile email`,
redirect `http://localhost:5179/oauth/callback`). In prod, register/confirm the client in
VoidAuth with the deploy domain's redirect URI and set `VOIDFEEDBACK_CLIENT_SECRET` to match
the seeded secret (or set `VOIDFEEDBACK_CLIENT_SECRET` in the VoidAuth env before seeding to
pin it).

## Docker

```bash
docker compose up --build   # builds client + server, serves everything on :3009
```

The database lives in the `feedback-data` named volume, so feedback survives container
recreates. Point `DATA_DIR` elsewhere if you'd rather keep it outside Docker.

## License

MIT — part of the **VoidSuite** app family.
