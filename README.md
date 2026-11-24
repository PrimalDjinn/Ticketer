# Ticketer

A help desk and issue tracker in one: people inside and outside your team open tickets (with screenshots and
documents), the team triages them with threaded replies, internal notes, @mentions and assignees, and a support chat
lands in a shared team inbox — for guests too. Any ticket can be published to a public issues page that needs no
login, so customers can follow known problems and announcements. Everything updates live.

Alongside the help desk sits Kaneo-style project tracking: projects with their own workflow columns, tasks with
priority, assignee, dates, labels and subtasks, a drag-and-drop board and a grouped list (`C` new task, `I` assign the open task to yourself, `Ctrl/Cmd+B`
toggle view, `Ctrl/Cmd+K` command palette), task comments with documents, an activity log, and "My tasks". Support
tickets can be handed to a project as a linked task.

### Who sees what

| | Admin | Member | Viewer | External | Guest (no account) |
| --- | --- | --- | --- | --- | --- |
| Projects and tasks | edit | edit | read | – | – |
| Tickets | all | all | all (read) | own + public | own + public |
| Ticket status, assignee, public/private, internal notes | ✓ | ✓ | – | – | – |
| Support inbox (`/conversations`) | reply, assign, close | reply, assign, close | read | own chats | own chats |
| Members, invitations, sign-up setting | ✓ | – | – | – | – |

Admin, member and viewer are **the team**; **external** accounts are customers, partners or anyone outside it.
Admins invite people from **Members** (choosing Team or Outside the team); invitation links are single-use and last
seven days, and are emailed when mail is configured. Sign-up is invitation-only by default; the **Who can sign up**
setting can open it, e.g. "Anyone, as external" for a customer portal.

Public issues live at `/issues` (and `/issues/<reference>`): the team marks a ticket public or posts one as public
from the start. Visitors see the description, attachments and public replies; internal notes never leave the team.
Signed-in people can reply to and follow public issues.

Built with Nuxt 4, Nuxt UI (Tailwind v4), Drizzle ORM through NuxtHub, and runs in two places from one codebase:

| Target | Database | Files | Realtime |
| --- | --- | --- | --- |
| **Cloudflare** (`cloudflare-durable` preset) | D1 | R2 | WebSocket / SSE / long-poll, fanned out by one Durable Object |
| **Node or Bun** (`node-server` preset, Docker) | SQLite file (libsql) | `.data/blob` on disk | Same transports, in process |

## Development

```bash
pnpm install
cp .env.example .env   # optional in dev: Nuxt generates a development NUXT_APP_SECRET
pnpm dev               # http://localhost:3000, data in .data/
```

The first account you register becomes an admin; admins invite people and change roles on **Members**. To set up the admin up front,
either set `NUXT_ADMIN_EMAIL` and `NUXT_ADMIN_PASSWORD` (created on first start if that email has no account; works
on Docker and Cloudflare) or use the CLI on a Node/Docker deployment:

```bash
pnpm admin --email you@example.com                     # prompts for a password; promotes the account if it exists
docker compose -f docker-compose.prod.yml exec ticketer node scripts/admin.mjs --email you@example.com
```

Schema changes: edit `server/db/schema.ts`, then `pnpm db:generate` to write a migration in
`server/db/migrations/sqlite`. Migrations apply automatically in dev, on boot in Docker, and in CI before a Cloudflare
deploy.

## Self-host with Docker

The image runs the Node build. The SQLite database and uploads live on one volume mounted at `/app/.data`.

```bash
export NUXT_APP_SECRET=$(openssl rand -base64 32)
docker compose up --build                                   # build from this checkout

# or run the published image (ghcr.io/primaldjinn/ticketer:latest by default)
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml --profile tunnel up -d   # + Cloudflare Tunnel (CLOUDFLARE_TUNNEL_TOKEN)
```

Without Docker: `pnpm build:node`, then
`LIBSQL_URL=file:.data/db/sqlite.db NUXT_APP_SECRET=… node .output/server/index.mjs` (or `bun`).

Mail for password resets: set `NUXT_MAIL_FROM`, plus `NUXT_MAIL_SMTP_URL` on Node. Without them, reset links are
written to the server log.

Branding (name, logo, colour), bot protection (Cloudflare Turnstile or Google reCAPTCHA) and due-date reminder times
are set in **Settings**; `NUXT_PUBLIC_APP_NAME` and `NUXT_CAPTCHA_*` pin them from the environment. See `.env.example`
and the [docs](https://primaldjinn.github.io/Ticketer/).

## Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/PrimalDjinn/Ticketer)

The button copies this repository to your GitHub account, creates the Worker, a D1 database, an R2 bucket and the
Durable Object, and asks for `NUXT_APP_SECRET` (and optionally the first admin's email and password). The Worker sets
up its database on the first request. Afterwards every push to your copy redeploys.

From your machine instead:

```bash
pnpm build:cloudflare
wrangler deploy                                    # creates the D1 database and R2 bucket on the first run
wrangler secret put NUXT_APP_SECRET
```

To use resources you already have, set `CF_D1_DATABASE_ID` and `CF_R2_BUCKET` before building (see `.env.example`).
Mail on Cloudflare goes through the `EMAIL` send_email binding: onboard your domain to Cloudflare Email Sending, build
with `CF_SEND_EMAIL=true`, and set the sender in **Settings → Email** (or `NUXT_MAIL_FROM`).

### CI

`.github/workflows/ci.yml` typechecks and builds both targets on every push, publishes the Docker image to GHCR, and
deploys to Cloudflare from `main` **only when the repository is configured for it**; otherwise that job is skipped
with a notice. To enable it in your fork, add:

- secrets: `CLOUDFLARE_API_TOKEN` (Workers, D1, R2 edit), `NUXT_APP_SECRET`
- variables: `CLOUDFLARE_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, optionally `CF_R2_BUCKET`, `CF_WORKER_NAME`,
  `CF_CUSTOM_DOMAIN`, `CF_SEND_EMAIL`, `NUXT_MAIL_FROM`, `NUXT_ADMIN_EMAIL` (and the secret `NUXT_ADMIN_PASSWORD`)

## Single sign-on

People can sign in with any OpenID Connect provider (Authentik, Keycloak, Entra ID, Google Workspace, Zitadel…):
authorization code flow with PKCE (S256), `state` and `nonce`, discovery from `<issuer>/.well-known/openid-configuration`,
and ID tokens verified against the provider's keys (RS256–512, PS256–512, ES256/ES384, EdDSA, or HS256 with the client secret). Plain
`fetch` and WebCrypto, so it works the same on Node and Workers.

Configure it in **Settings → Sign-in** (with a **Test connection** button and the callback URL to copy), or pin any
field with environment variables, which win over Settings and show there as read-only:

| Variable | Meaning |
| --- | --- |
| `NUXT_OIDC_ISSUER` | Issuer URL, e.g. `https://auth.example.com/application/o/ticketer/` (Authentik: the "OpenID Configuration Issuer") |
| `NUXT_OIDC_CLIENT_ID`, `NUXT_OIDC_CLIENT_SECRET` | The application's credentials (leave the secret empty for a public client) |
| `NUXT_OIDC_ENABLED` | `true`/`false`; implied `true` when issuer and client id both come from env |
| `NUXT_OIDC_NAME` | Button label, "Continue with …" (default `Single sign-on`) |
| `NUXT_OIDC_SCOPES` | Default `openid email profile` |
| `NUXT_OIDC_DEFAULT_ROLE` | Role for brand-new people: `external` (default), `viewer`, `member`, or `none` (only invited or group-mapped people) |
| `NUXT_OIDC_GROUPS_CLAIM` | Claim with the groups, default `groups` (dotted paths work: `realm_access.roles`) |
| `NUXT_OIDC_ROLE_GROUPS` | `admin:ticketer-admins,member:staff,viewer:auditors,external:customers` |
| `NUXT_OIDC_ONLY` | `true` hides the password form, password sign-up and reset |
| `NUXT_OIDC_REDIRECT_URL` | Only behind a proxy that hides the public origin: the full callback URL |

Register `https://<your site>/auth/oidc/callback` as the redirect URI. The sign-in button goes to
`/auth/oidc/login?redirect=/path`. The client secret entered in Settings is stored encrypted with a key derived from
`NUXT_APP_SECRET` (changing that secret means entering it again).

How accounts are matched: by the provider's subject first; otherwise an existing account with the same email is linked
**only if the provider marks the email verified** (`email_verified`); otherwise a new account is created (a guest's
history in the same browser moves to it). A new account's role comes from the mapped groups, else a pending invitation
for that email (which is then used up), else admin for the very first account, else `NUXT_OIDC_DEFAULT_ROLE`. When
`NUXT_OIDC_ROLE_GROUPS` is set and one of the person's groups matches, it decides the role at every sign-in (the most
powerful match wins), so group changes in the provider apply; people in no mapped group keep their role, and the last
admin is never demoted. Who may create a password account is still the **Members → Who can sign up** setting.

In SSO-only mode password sign-in is kept for admins only, as a break-glass when the provider is down
(`/auth/login?password`); the `NUXT_ADMIN_*` bootstrap and `pnpm admin` keep working.

Authentik: create an OAuth2/OpenID provider (confidential client, redirect URI as above, signing key set for RS256 or
none for HS256) and an application with slug `ticketer`; the issuer is `https://<authentik>/application/o/ticketer/`.
Add a groups scope mapping if you use `NUXT_OIDC_ROLE_GROUPS`, and make sure the email scope reports
`email_verified: true` if existing password accounts should be linked.

## Integrations

Other products can send their users here, e.g. a "Report a problem" button that signs the person in and opens a
prefilled ticket, a support chat, or their ticket list. Admins connect an app in **Settings → Integrations**: a name,
allowed return origins (for a "Back to <app>" link), the default landing page, and whether it may create accounts. The
API key and signing secret are shown once (rotate to get new ones); only a SHA-256 hash of the key is stored and the
signing secret is encrypted. The page lists usage and has copy-paste samples filled in for your site.

**Integration keys only ever sign in people outside the team.** An email that belongs to an admin, member or viewer (or
has a pending team invitation) is refused with `409`; such people sign in directly. Redirect targets are fixed paths
chosen by Ticketer, and a `returnUrl` must match one of the app's allowed origins.

1. **Login link (server to server)**: `POST /api/integrations/v1/sessions` with `Authorization: Bearer <key>` (or
   `X-Api-Key`) and `{ email, name?, externalId?, target?, ticketId?, ticket?: { title, description?, urgency?, context? }, returnUrl? }`.
   The person is found by `externalId` (per app) or email, or created as an external account; with `ticket`, it is
   opened in their name (they follow it, and the description gets a "Reported from <app>" section with the context).
   Answers `{ url, expiresAt, userId, created, ticket? }`; `url` signs them in once, within 5 minutes, and lands on
   `target`: `new-ticket`, `chat`, `tickets`, or `ticket` (with `ticketId`); default the app's landing page, or the new ticket.
2. **Redirect**: `GET /api/integrations/v1/sessions?email=…` with the key in a header answers `302` to the login link.
   Parameters are snake_case: `email`, `name`, `external_id`, `target`, `ticket_id`, `title`, `description`,
   `urgency`, `context[key]`, `return_url`.
3. **Signed browser link**: `GET /launch?app=<app id>&email=…&ts=<unix seconds>&nonce=…&sig=…` plus any parameter from 2.
   The link is accepted for 5 minutes (and 1 minute of clock skew), once per nonce (16-128 of `A-Z a-z 0-9 - _`).
4. **Prefill only**: `GET /launch?app=<app id>&title=…&description=…&urgency=…&context[url]=…` without `email`/`sig`
   opens the new-ticket form prefilled; nobody is signed in by it.
5. **Their tickets**: `GET /api/integrations/v1/tickets?email=…&status=open|closed|all&limit=20` (key auth) returns the
   person's tickets with status and links.

Errors: `401` missing or wrong key, `403` app disabled or not allowed to create accounts, `409` team member, `400`
invalid input. Browser links that fail land on the sign-in page with an explanation.

Signing recipe for 3 (`sig`):

1. Take every query parameter except `sig` (a repeated parameter is rejected).
2. Percent-encode each name and value per RFC 3986: every byte of the UTF-8 text except `A-Z a-z 0-9 - _ . ~` becomes
   `%XX` with uppercase hex (a space is `%20`, `[` is `%5B`). JavaScript: `encodeURIComponent(v).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())`;
   Python: `urllib.parse.quote(v, safe="")`; PHP: `rawurlencode`.
3. Sort the pairs by encoded name (byte order) and join them as `name=value` with `&`.
4. `sig` = lowercase hex HMAC-SHA256 of that string with the signing secret as the key. Use the same string as the
   query and append `&sig=<sig>`.

```js
import { createHmac, randomBytes } from 'node:crypto'
const enc = (v) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
function launchUrl(params) {
  const all = { ...params, app: 'app_…', ts: String(Math.floor(Date.now() / 1000)), nonce: randomBytes(16).toString('hex') }
  const canonical = Object.entries(all).map(([k, v]) => [enc(k), enc(String(v))])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&')
  const sig = createHmac('sha256', process.env.TICKETER_SIGNING_SECRET).update(canonical).digest('hex')
  return `https://tickets.example.com/launch?${canonical}&sig=${sig}`
}
launchUrl({ email: 'jane@example.com', name: 'Jane', title: 'Export fails', 'context[url]': 'https://app.example.com/reports' })
```

Every key use is logged (`[integrations]`), and apps can be turned off or deleted at once.

## How realtime works

`app/utils/realtime.ts` connects over WebSocket, falls back to Server-Sent Events, then long polling, reconnects with
backoff, and periodically retries WebSocket after a fallback. After any gap it emits `resync` so screens refetch.

`server/utils/realtime.ts` holds the connections. On Node that is the process; on Cloudflare every realtime request
is routed into a single Durable Object (`server/middleware/realtime.ts`), and API routes hand events to it with
`durableFetch`. WebSockets there use hibernation, so idle connections cost nothing.
