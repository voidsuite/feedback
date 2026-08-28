# docs — Void Docs

**Encrypted, local-first word processor with real-time collaboration.** Part of the VoidSuite family: a Google-Docs-style editor that keeps your documents on your device, end-to-end encrypted, with optional cloud backup and share-link collaboration through VoidAuth.

![Void Docs](client/public/favicon.svg)

## What you get

- **Docs-style editing** — familiar menubar + format toolbar, click-to-rename title, centered paper page on a muted canvas, ruler with draggable margins, zoom, "Page · words" status bar, outline + comments sidebars.
- **Local-first** — every keystroke is saved to IndexedDB instantly. Works fully offline, no account required.
- **End-to-end encrypted cloud sync** — your documents are encrypted on-device and mirrored to your VoidAuth storage. The gateway never sees document content or keys.
- **Real-time collaboration** — share a link (the key travels in the URL fragment, never to the server) and edit together over an encrypted WebSocket relay with live cursors.
- **Comments & suggestion mode** — Google-Docs-style tracked changes (accept/reject), comment threads with replies and resolve.
- **Version history** — automatic checkpoints while you edit, plus named versions that are kept forever, with restore.
- **Import / export** — export `.docx`, `.pdf`, `.md`, `.html`, `.txt`; import `.docx`, `.md`, `.html`, `.txt`.
- **Fonts** — a broad bundled font library with live previews, plus your system fonts.
- **Themes & accents** — warm-stone VoidAuth design language with dark/light/system themes and six accents.

## Security model

| Layer | How it works |
| --- | --- |
| Local storage | Documents, edits and version snapshots are encrypted with AES-GCM-256 before touching IndexedDB. |
| Vault key | One 256-bit key per user. Cached on-device; escrowed (wrapped under a server-side key) on the gateway for recovery; in browser auth mode it's mirrored into your VoidAuth app storage instead. Device-key fallback when offline. No passphrases, ever. |
| Doc keys | Each document has its own key, wrapped under your vault key. Share links carry the unwrapped key in the URL fragment (`#k=…`), which is never sent to any server. |
| Cloud sync | A single encrypted blob (docs + edits + versions) is stored in your VoidAuth app storage. The gateway only ever sees ciphertext. |
| Collaboration | Edits travel over the WebSocket relay as encrypted frames. The relay routes bytes between peers; it holds no keys. |

**Escrow trade-off:** the gateway can recover your vault key *for your account* (this is how new devices unlock without a passphrase). This is automatic key management — convenient, but it means a compromised gateway could theoretically unwrap keys. Self-host (below) if you want the trust boundary entirely under your control.

## Architecture

```
client/   React 19 + Vite 8 + Tailwind 4 + shadcn (base-ui) + TipTap 3 + Yjs
server/   Bun + Hono gateway: OAuth PKCE proxy, session cookies, storage
          proxy, vault-key escrow, encrypted WebSocket collab relay
```

Three auth modes via `VITE_AUTH_MODE`:

- `backend` (recommended) — OAuth through the docs gateway; httpOnly session cookie.
- `browser` — direct PKCE with `@voidauth/client`; tokens in `sessionStorage`.
- `offline` — no VoidAuth at all; fully functional single-device local mode.

## Development

```bash
bun run install:all          # install client + server deps
bun run dev:server           # gateway on :3005
bun run dev:client           # Vite on :5176 (proxies /api to :3005)
```

Verification:

```bash
bun run typecheck            # client (tsc -b) + server (tsc --noEmit)
bun run build                # production client build
bun run lint                 # oxlint
bun run verify               # all of the above
```

## Configuration

Copy `.env.example` → `.env` (server) and see the file comments. The app runs with zero config in local mode; cloud sync + collaboration need a VoidAuth client registered for `docs` (redirect `APP_URL/oauth/callback`).

| Variable | Purpose |
| --- | --- |
| `VOIDAUTH_URL` | VoidAuth issuer (prod `https://auth.stwupid.tech`). |
| `VDOCS_CLIENT_ID` / `VDOCS_CLIENT_SECRET` | OAuth client for docs. |
| `APP_URL` | Public app URL (OAuth redirect, CORS, secure cookies). |
| `PORT` | Gateway port (default `3005`). |
| `SESSION_SECRET` | Encrypts the vault-key escrow at rest. If empty, a stable secret is generated on first boot and stored in the same DB. |
| `VITE_AUTH_MODE` | `backend` \| `browser` \| `offline`. |
| `VITE_API_URL` | Gateway origin (same-origin by default). |

## Self-hosting

```bash
cp .env.example .env          # fill in values
docker compose up -d          # serves the app + gateway on :3005
```

The gateway serves the built client and exposes `/health` for container health checks. The escrow database lives at `server/data/vdocs.db`.

## License

MIT — see [LICENSE](LICENSE). "docs" is part of the **VoidSuite** app family.
