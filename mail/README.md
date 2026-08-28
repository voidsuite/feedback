<div align="center">
  
## - mail -
an opensourced web mail client for SMTP and POP3.
<br>
<br>

The app has integrated cloud sync through [VoidAuth](https://github.com/voidsuite)
it can send, receive mails as the name suggests but that's not all! more will be listed in the official Void docs

#### Self-hosting
if you wanna self host this mail client you def can!
It's build on typescript so you will need some node.js package manager. We use **bun** and is highly recommended to use it too!

checkout the Void docs that have detailed tutorials if you need setup instructions.. But mostly all you need is to copy ``.env.example`` to ``.env.`` and fillout the fields
then just build it and run both frontend and backend!

orr you can just deploy it on Docker:
```bash
docker compose up --build   # builds client + server, serves everything on :3003
```

#### VoidSuite apps

- **[Void Feedback](https://github.com/voidsuite/feedback)** — support & feedback hub with live admin chat
- **[Board](https://github.com/voidsuite/board)** — Kanban project boards
- **[2FA](https://github.com/voidsuite/2fa)** — encrypted, cloud-synced TOTP authenticator
- **[Docs](https://github.com/voidsuite/docs)** — end-to-end encrypted collaborative editor
- **[VoidAuth](https://github.com/voidsuite/client)** — central OAuth / OIDC + identity server

#### - <img src="https://wsrv.nl/?url=https://raw.githubusercontent.com/voidsuite/.github/refs/heads/main/logo.png&w=40"  align="center"/> -

</div>


