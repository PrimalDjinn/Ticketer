# Ticketer

A small internal help desk: people open tickets (with screenshots and documents), support staff triage them, everyone
talks in threaded comments with @mentions and attachments, and a support chat is one click away — for guests too.
Everything updates live.

Alongside the help desk sits Kaneo-style project tracking: projects with their own workflow columns, tasks with
priority, assignee, dates, labels and subtasks, a drag-and-drop board and a grouped list (`C` new task, `Ctrl/Cmd+B`
toggle view, `Ctrl/Cmd+K` command palette), task comments with documents, an activity log, and "My tasks". Support
tickets can be handed to a project as a linked task. Roles: admin, member, viewer (read-only).

Built with Nuxt 4, Nuxt UI (Tailwind v4), Drizzle ORM through NuxtHub, and runs in two places from one codebase:

| Target | Database | Files | Realtime |
| --- | --- | --- | --- |
| **Cloudflare** (`cloudflare-durable` preset) | D1 | R2 | WebSocket / SSE / long-poll, fanned out by one Durable Object |
| **Node or Bun** (`node-server` preset, Docker) | SQLite file (libsql) | `.data/blob` on disk | Same transports, in process |

## Development

```bash
pnpm install
cp .env.example .env   # optional in dev: nuxt-auth-utils generates a session secret
pnpm dev               # http://localhost:3000, data in .data/
```

The first account you register becomes an admin. Admins can promote others from **Users**.

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

## Deploy to Cloudflare

```bash
wrangler d1 create ticketer
wrangler r2 bucket create ticketer-files
export CF_D1_DATABASE_ID=<id from above>
pnpm build:cloudflare
pnpm cf:migrate
wrangler deploy --config .output/server/wrangler.json
wrangler secret put NUXT_APP_SECRET --config .output/server/wrangler.json
```

Mail on Cloudflare goes through the `EMAIL` send_email binding; the `NUXT_MAIL_FROM` domain must be onboarded to
Cloudflare Email Sending.

### CI

`.github/workflows/ci.yml` typechecks and builds both targets on every push, publishes the Docker image to GHCR, and
deploys to Cloudflare from `main` **only when the repository is configured for it**; otherwise that job is skipped
with a notice. To enable it in your fork, add:

- secrets: `CLOUDFLARE_API_TOKEN` (Workers, D1, R2 edit), `NUXT_APP_SECRET`
- variables: `CLOUDFLARE_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, optionally `CF_R2_BUCKET`, `CF_WORKER_NAME`, `NUXT_MAIL_FROM`

## How realtime works

`app/utils/realtime.ts` connects over WebSocket, falls back to Server-Sent Events, then long polling, reconnects with
backoff, and periodically retries WebSocket after a fallback. After any gap it emits `resync` so screens refetch.

`server/utils/realtime.ts` holds the connections. On Node that is the process; on Cloudflare every realtime request
is routed into a single Durable Object (`server/middleware/realtime.ts`), and API routes hand events to it with
`durableFetch`. WebSockets there use hibernation, so idle connections cost nothing.
