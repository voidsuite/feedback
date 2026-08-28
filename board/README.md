# board — Void Board

**Kanban project boards for the VoidSuite family.** Sign in with **VoidAuth** once and your
boards sync automatically to any device — no passphrase, nothing to enter. Trello-style boards
with columns and cards, projects, member assignments, multiple render views, real-time
multiplayer workspaces, images and Markdown formatting.

> **Security model (be aware):** VoidBoard is deliberately *server-authoritative* for
> zero-friction sync — boards live in the app's own database, not end-to-end encrypted like
> voiddraw/docs. The server can read your boards (that's the chat-app trade-off). Access is
> gated by your VoidAuth account, transport is TLS in production. E2E encryption is a
> deliberate non-goal for v1.

## Highlights

| Feature | How it works |
| --- | --- |
| Sign in with VoidAuth | OAuth 2.0 + PKCE against VoidAuth (browser SDK or gateway proxy) — the gateway mints an httpOnly session cookie. |
| Automatic sync | Workspaces, boards, projects, items and comments live in a server-side SQLite database keyed to your account; **log in on any device and everything is there**. Sessions survive restarts. |
| Boards, projects, items | Workspace → Project → Board → Columns → Items, with labels, priorities, due dates. |
| Member assignments | Assign real users to cards; workspace members curated via invite link. |
| Render views | Board (kanban), Table and List views over the same data with filters. |
| Multiplayer | Optimistic edits + authenticated WebSocket push: peers see card moves, column changes and presence (who's online) live. |
| Images & markdown | Card covers/attachments (uploads, auth-gated) and Markdown descriptions/comments. |
| Offline shell | Service worker caches the app shell (never auth/API traffic) — the UI loads instantly and works offline. |

## Architecture

```
client/   Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui (Base UI) — PWA
server/   Bun + Hono gateway: VoidAuth session, REST API, SQLite store, WebSocket push
```

- Client :5177 · gateway :3006 · SQLite at `server/data/voidboard.db` (auto-migrated on boot).
- Auth modes via `VITE_AUTH_MODE`: `backend` (gateway proxy, recommended) or `browser`
  (`@voidauth/client` PKCE directly against VoidAuth).

## Getting started

Requires [Bun](https://bun.sh) ≥ 1.2.

```bash
cp .env.example .env        # fill in values (see below)
bun dev.ts                  # client :5177 + gateway :3006 together
```

Open the client, sign in with VoidAuth, create a workspace, board, columns and cards. Open a
second browser with the same account (or a friend via the workspace invite link) and watch
edits sync live.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `VOIDAUTH_URL` | VoidAuth issuer (prod `https://auth.stwupid.tech`). |
| `VOIDBOARD_CLIENT_ID` / `VOIDBOARD_CLIENT_SECRET` | OAuth client for voidboard (backend mode). |
| `APP_URL` | Public app URL (OAuth redirect, CORS, secure cookies). |
| `PORT` | Gateway port (default `3006`). |
| `VITE_AUTH_MODE` | `backend` (default) \| `browser`. |
| `VITE_VOIDAUTH_CLIENT_ID` | Same value as `VOIDBOARD_CLIENT_ID` (browser mode). |

### Registering the OAuth client

Ask the voidsuite admin to register a VoidAuth client for `voidboard` with scopes
`openid profile email` and redirect URI `<APP_URL>/oauth/callback`, then put the issued
client id/secret into `.env`. In local dev, the VoidAuth seed already includes a `voidboard`
client pointing at `http://localhost:5177/oauth/callback`.

## Docker

```bash
docker compose up --build   # builds client + server, serves everything on :3006
```

The database and uploads live in the `board-data` named volume, so your boards
survive container recreates. Point `DATA_DIR` elsewhere if you'd rather keep them
outside Docker.

## License

MIT — see [LICENSE](LICENSE). board is part of the **VoidSuite** app family.