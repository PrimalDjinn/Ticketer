# RFC 0001: Apps, a public API and webhooks

| | |
| --- | --- |
| Status | Draft, for discussion |
| Date | 2026-11-26 |
| Scope | How other software extends Ticketer and calls it: a public API, webhooks, installable apps, UI extensions, and AI agents |

## Summary

An **app** is a program that runs **outside** Ticketer, on a server that belongs to whoever wrote it. Ticketer knows
about the app. The app:

- **acts** through a public, versioned REST API, with its own identity and a set of scopes an admin approved;
- **hears** about changes through signed webhooks;
- **appears** in Ticketer's interface only by returning small JSON documents that Ticketer renders itself.

Slack, Linear, Plane, GitHub, Zapier, n8n, a customer's own scripts and AI agents all fit this model. Each one is
an app, a personal access token, or an MCP client. Nothing in this plan runs third-party code inside Ticketer.

The work comes in phases, and each phase is useful on its own:

1. Domain commands and an event outbox.
2. Personal access tokens and `/api/v1`.
3. Webhooks.
4. An MCP server.
5. Installable apps with bot users.
6. UI extensions.
7. Agents and automations.

Phases 1 to 4 deliver most of the value: Ticketer becomes scriptable, Zapier, n8n and AI agents work, and anyone can
build a Slack or Linear bridge. They take roughly two months of focused work for one developer. The rest can follow when someone needs it, or never.

## Contents

1. [Goals and non-goals](#goals-and-non-goals)
2. [Where Ticketer is today](#where-ticketer-is-today)
3. [What other platforms teach us](#what-other-platforms-teach-us)
4. [The design at a glance](#the-design-at-a-glance)
5. [Building blocks](#building-blocks)
   1. [Commands and the event outbox](#1-commands-and-the-event-outbox)
   2. [Actors, tokens and scopes](#2-actors-tokens-and-scopes)
   3. [Public API v1](#3-public-api-v1)
   4. [Webhooks](#4-webhooks)
   5. [Apps: manifest, install and bot users](#5-apps-manifest-install-and-bot-users)
   6. [UI extensions](#6-ui-extensions)
   7. [AI: MCP server, agents and the skill](#7-ai-mcp-server-agents-and-the-skill)
   8. [Automations](#8-automations)
   9. [Code inside Ticketer, and why not yet](#9-code-inside-ticketer-and-why-not-yet)
6. [Examples: Slack, Linear and Plane, Zapier and n8n](#examples)
7. [What happens to what exists](#what-happens-to-what-exists)
8. [Data model](#data-model)
9. [Security](#security)
10. [Phases, effort and what we won't build](#phases-effort-and-what-we-wont-build)
11. [Open questions](#open-questions)
12. [Sources](#sources)

## Goals and non-goals

**Goals**

- Anyone with an account can script Ticketer from outside, within what their role allows.
- Integrations such as Slack, Linear, Plane, GitHub, Sentry or a CRM can be built **without changing Ticketer's
  code** for each one.
- AI agents can read and act on tickets, chats and tasks safely, through MCP.
- Everything works the same on Node (Docker, SQLite) and on Cloudflare Workers, **including the free plan**.
- A small team can build it in phases and keep it running. A public API is a promise kept for years, so the surface
  stays small.

**Non-goals, for now**

- An app marketplace, app reviews or billing.
- Running third-party code inside Ticketer. See [section 9](#9-code-inside-ticketer-and-why-not-yet).
- iframes or custom UI inside Ticketer's pages.
- GraphQL.
- Several organisations in one install. Each Ticketer install is one organisation, so "install an app" means
  "install it on this Ticketer".

## Where Ticketer is today

| What | How it works | Limits |
| --- | --- | --- |
| **Integration apps** (Settings > Integrations) | Another product sends its users to Ticketer with login links, signed launch links or prefill links. It can also look up a person's tickets and delete people. Auth is an API key or a signing secret. | Only for people outside the team. No staff actions, no events. |
| **GitHub sync** | A built-in GitHub App: webhooks come in, and changes go out from inside the task handlers (`pushTask`, `pushComment`). | Hard-coded. Each new integration of this kind means more code in the core. |
| **Internal API** (`/api/*`, 124 routes, 80 of them write) | Session cookie. Shaped for Ticketer's own pages. | Not versioned or documented, and nobody outside should use it. |
| **Realtime** | An in-process event union (`ticket.updated`, `task.created`, …) fanned out to browsers over WebSocket, SSE or long polling; through a Durable Object on Cloudflare. | Only reaches browsers that are open, and isn't stored. |
| **Side effects** | Each route handler calls `publish`, `notify`, `broadcastTicket`, `pushTask`, `recordActivity` and so on itself: 67 call sites. | Easy to forget one, and there's no single place to hook in. |

That last row matters most. Before Ticketer can tell the outside world that something happened, it needs **one
place** where "something happened" is recorded.

## What other platforms teach us

The research behind this section is summarised under [Sources](#sources).

| Platform | How it's extended | What we take from it |
| --- | --- | --- |
| **Slack** | Apps are remote HTTP services described by a **manifest**: scopes, event subscriptions, an interactivity URL. Requests are signed (`v0:timestamp:body`), apps must answer within **3 s**, and the UI is declarative **Block Kit** JSON. **Socket Mode** serves apps behind firewalls. | The manifest as the single source of truth. Declarative UI. A short deadline with "acknowledge now, do the work later". |
| **GitHub Apps** | The **manifest flow** registers an app in one click. Installation tokens last 1 hour, and permissions are fine-grained. When an app asks for more permissions, the old ones stay until an admin approves. The **Checks API** gives an app a status panel on a commit. | One-click registration, which Ticketer already uses for GitHub sync. Re-approval only when an app asks for *more*. A panel on an object for its status. |
| **Linear** | OAuth with `actor=app`, so the app acts as itself. Scopes such as `issues:create`. Webhooks signed with HMAC and a timestamp, retried 3 times, then disabled. **Attachments**: an app links an external URL to an issue, idempotently. **Agents** are bot users you can mention or delegate to, and they post typed activities. | A bot identity for each app. The links primitive. The agent model. |
| **Plane** (open source, self-hosted) | REST `/api/v1`, `X-API-Key`, cursor pagination. Webhooks carry an `event_id` that stays the same across retries, plus `previous_attributes`. Apps get a bot token by client credentials. Scopes look like `projects.work_items:write`. **OAuth apps don't exist in the free self-hosted edition.** | The scope grammar, and `previous_attributes`. A warning: **app registration must work on every install.** |
| **Atlassian** | Connect (remote apps in iframes) is being retired for Forge (hosted functions). Atlassian cites security and tenant isolation, and admits it will charge for compute. | Hosting other people's code is a business in itself. We shouldn't start one. |
| **Zendesk, Intercom, Chatwoot** | Zendesk: sidebar apps in iframes. Intercom Canvas Kit: the app's server returns **JSON component trees** that Intercom renders natively. Chatwoot: agent bots and dashboard iframes. | Help-desk sidebars are where apps matter most. Native JSON cards beat iframes on looks, safety and mobile. |
| **Mattermost** | Kept two frameworks: in-process Go plugins and an HTTP "Apps framework". In 2024 it **dropped the HTTP one**, because its own features were built on plugins. | **Build our own integrations on the same rails we offer others**, or those rails will rot. |
| **Rocket.Chat** | Sandboxed apps moved from `vm` to vm2 to Deno and back to Node within a few years. Self-hosters broke when the Deno binary was missing. | Sandboxing JavaScript in-process is a moving target, and every extra runtime is a packaging burden. |
| **Standard Webhooks** | A shared spec: `webhook-id`, `webhook-timestamp` and `webhook-signature` headers, signing `v1,base64(HMAC-SHA256(id.timestamp.body))`, a published retry schedule. OpenAI and Anthropic use it, and Svix delivers it. | Copy it exactly. Then receivers can use existing libraries in every language. |
| **MCP** (2026-07-28 revision) | Stateless Streamable HTTP. OAuth 2.1 with protected-resource metadata and client ID metadata documents. Linear, Sentry, Notion, Stripe and Cloudflare all serve remote MCP at `/mcp`. | AI agents arrive through MCP, not through a separate "AI API". |

Six lessons come out of this:

1. **Apps run outside Ticketer and talk HTTP.** It's the only model that works the same on both runtimes, and it keeps other people's bugs out of our process.
2. **Build our own integrations with the same tools as everyone else.** Our future Slack app and the GitHub sync must use the public pieces.
3. **Use standards rather than inventing.** Standard Webhooks, OAuth 2.1, OpenAPI and MCP.
4. **Make UI extensions declarative.** Small JSON cards that Ticketer renders, not iframes.
5. **Every app gets an identity and scopes**, and its actions show up in history as the app.
6. **Version everything from day one**: the API path, the manifest and the card schema.

## The design at a glance

```text
  OUTSIDE                                       TICKETER
  ───────                                       ────────
  scripts, CI, Zapier ──personal token──┐
  apps (Slack bridge, ──app token───────┼──▶ /api/v1 (REST + OpenAPI) ──┐
   Linear/Plane sync)                   │                                │
  AI agents ──────────OAuth / token─────┴──▶ /mcp (tools = same commands)┤
                                                                         ▼
  embedded products ──API key / signed link──▶ /api/integrations/v1 ──▶ COMMANDS ──▶ database
                                                (unchanged)              │   (createTicket,
                                                                         │    reply, assign…)
                                                                         ▼
  apps ◀───────── signed webhooks ◀── delivery queue ◀──────────── EVENT OUTBOX
  apps ◀── "action" / "panel" requests ◀── Ticketer UI                   │
        ── JSON cards, links ──────────▶ rendered by Ticketer            ├──▶ realtime (browsers)
                                                                         ├──▶ notifications, email, push
                                                                         └──▶ GitHub sync, automations
```

Every write goes through a **command**, whatever the caller: Ticketer's own pages, the public API, MCP, or an
automation. Each command records an **event**. Realtime, notifications, webhooks and integrations all consume those
events, instead of every route handler calling each of them.

## Building blocks

### 1. Commands and the event outbox

**What.** Move the business logic out of the route handlers into commands in `server/services/`, for example
`tickets.create`, `tickets.update`, `tickets.reply`, `conversations.reply`, `tasks.update`. A command:

- takes an **actor** (a user, an app, or the system) and validated input;
- checks permissions;
- writes the change and an **event row** together, using `db.batch` on D1 or a transaction on libsql;
- returns the result.

Route handlers become thin wrappers, roughly ten lines each.

```ts
// server/services/tickets.ts (sketch)
export async function updateTicket(ctx: CommandContext, id: number, input: TicketPatch) {
  const ticket = await loadTicketFor(ctx.actor, id)
  can(ctx.actor, 'tickets:write', ticket) // role and scopes
  const changes = diff(ticket, input)
  if (!changes) return ticket
  const updated = await ctx.write(async (tx) => {
    const [row] = await tx.update(schema.tickets).set({ ...changes.to, updatedAt: ctx.now }).where(eq(schema.tickets.id, id)).returning()
    await tx.insert(schema.events).values(event(ctx, 'ticket.updated', { ticket: row, changes }))
    return row
  })
  return updated
}
```

**Event shape.** The same shape is stored, sent to webhooks and given to automations:

```json
{
  "id": "evt_01m8c3…",
  "type": "ticket.updated",
  "occurredAt": "2026-11-26T09:14:03.512Z",
  "actor": { "type": "user", "id": "01m7…", "name": "alice" },
  "subject": { "type": "ticket", "id": 42 },
  "data": { "ticket": { "…": "snapshot after the change" } },
  "changes": { "status": { "from": "Open", "to": "Pending" }, "assigneeId": { "from": null, "to": "01m7…" } }
}
```

`actor.type` can also be `app`, with the app's ID, or `system`, for reminders and automations.

**Consumers.** An event dispatcher runs after the request, with `waitUntil` on both runtimes. It hands each new event
to:

- **realtime**, which replaces the direct `publish` calls;
- **notifications** (email and push), which replaces `notify` in handlers;
- **GitHub sync**, which replaces `pushTask` and `pushComment` inside handlers;
- **webhooks**, which queues deliveries;
- **automations**, later.

**Why first.** It pays for itself before any app exists: one place for side effects and fewer "forgot to notify"
bugs. It also gives a full history (the `task_activity` table could become a view on it), and every later phase needs
it.

**Event catalogue, version 1.** The names follow the existing realtime events:

| Area | Events |
| --- | --- |
| Tickets | `ticket.created`, `ticket.updated` (status, assignee, title, urgency, visibility in `changes`), `ticket.deleted`, `ticket.comment.created`, `ticket.comment.deleted` |
| Support chats | `conversation.created`, `conversation.updated`, `conversation.message.created` |
| Projects | `project.created`, `project.updated`, `project.archived`, `task.created`, `task.updated`, `task.deleted`, `task.comment.created` |
| People | `person.created`, `person.updated`, `person.deleted` |
| Apps | `app.installed`, `app.uninstalled` |

Internal notes are events like any other, but they're delivered only to receivers with the `notes:read` scope. People
outside the team never get them, through any path.

**Retention.** Events are kept for 30 days by default (`NUXT_EVENTS_RETENTION_DAYS`). The hourly job that already
prunes GitHub deliveries removes older ones.

### 2. Actors, tokens and scopes

**Who can call the API.**

| Principal | Acts as | Gets its token | Typical use |
| --- | --- | --- | --- |
| Session | The signed-in person | Signs in | Ticketer's own pages |
| **Personal access token** | The person who made it, limited by its scopes | **Account** > **Access tokens** | Scripts, CI, Zapier, n8n, a personal MCP client |
| **App token** | The app's **bot user**, limited by the app's scopes | App install ([section 5](#5-apps-manifest-install-and-bot-users)) | Slack bridge, Linear or Plane sync, agents |
| Integration API key (exists) | The integration, for **outside** people only | **Settings** > **Integrations** | Embedding: unchanged |

**What a call may do** is the intersection of two things: the **role** of the identity it acts as, and the **scopes**
of the token. A member's token with `tickets:write` can reply to tickets. A viewer's token with `tickets:write` still
can't, because viewers can't. An app's bot user has the member role, never admin.

**Scopes** use `resource[.sub]:read|write`, as Plane does. There are few of them, and each maps to a clear permission:

| Scope | Allows |
| --- | --- |
| `tickets:read`, `tickets:write` | Tickets, their replies and files. `write` covers replying, status, assignee and visibility. |
| `notes:read`, `notes:write` | Internal notes on tickets and chats. Separate scopes, so a status-sync app never sees private notes. |
| `conversations:read`, `conversations:write` | Support chats |
| `projects:read`, `projects:write` | Projects, statuses, fields, labels |
| `tasks:read`, `tasks:write` | Tasks, task comments, relations |
| `people:read` | Names **and email addresses** of people. Personal data, shown as such on the consent screen. |
| `people:write` | Invite, change roles (admin tokens only), delete outside people |
| `links:write` | Attach external links to tickets and tasks |
| `admin` | Settings. Personal tokens of admins only, never apps. |

**Token format.** Like the existing integration keys: `tkp_` (personal) or `tka_` (app) followed by random hex. Only
the SHA-256 hash and the first characters are stored. Each token has a name, scopes, an optional expiry and a
**Last used** time, and the person or an admin can revoke it. Admins see every token on the instance and can revoke
any of them.

**In code.** Add `requireActor(event, scope)` next to `requireUser` and friends. It accepts either the session or
`Authorization: Bearer`, re-reads the role from the database as `currentRole` does today, and returns
`{ actor, scopes }`. A request that carries a bearer token never also uses the session cookie, so a token can't borrow
someone's browser session, and session-cookie CSRF rules keep applying only to the pages.

### 3. Public API v1

**Shape.** JSON over HTTP at `/api/v1/…`. Resources follow the product:

```text
GET    /api/v1/me
GET    /api/v1/tickets?status=&assignee=&q=&updatedSince=&cursor=&limit=
POST   /api/v1/tickets
GET    /api/v1/tickets/{id}
PATCH  /api/v1/tickets/{id}
GET    /api/v1/tickets/{id}/comments
POST   /api/v1/tickets/{id}/comments          { body, internal?, parentId? }
POST   /api/v1/tickets/{id}/links             { url, title, subtitle?, status?, iconUrl? }
GET    /api/v1/conversations, /{id}, POST /{id}/messages
GET    /api/v1/projects, /{key}, /{key}/statuses
GET    /api/v1/tasks?project=&status=&assignee=  POST /api/v1/tasks  PATCH /api/v1/tasks/{id}
POST   /api/v1/tasks/{id}/comments
GET    /api/v1/people?q=&role=
POST   /api/v1/files                          (upload; returns an id to attach)
GET    /api/v1/events?after=evt_…             (the same events as webhooks, for polling)
```

**Conventions.** Pick them once and keep them:

- **Pagination:** an opaque `cursor`. Responses are `{ "data": [...], "nextCursor": "…" | null }`, with a default of
  50 items and a maximum of 100.
- **Writes** accept an `Idempotency-Key` header. Ticketer remembers the response for 24 hours, so a retried `POST`
  never creates two tickets.
- **Errors** keep today's JSON shape and add a stable `code`, such as `ticket_not_found` or `insufficient_scope`. The
  message tells the caller how to fix the problem, which helps AI agents especially.
- **Rate limits:** about 600 requests per minute per token by default (`NUXT_API_RATE_LIMIT`), with `RateLimit-*`
  headers and `429` plus `Retry-After`. On Cloudflare the counter lives in the Durable Object Ticketer already has.
  On Node it lives in memory.
- **Versioning:** `/v1` changes only by addition. A breaking change means `/v2`. Endpoints on their way out send
  `Deprecation` and `Sunset` headers.
- **IDs and times:** today's IDs, numbers for tickets, ULIDs elsewhere. ISO 8601 times in UTC.

**OpenAPI.** Zod v4, which Ticketer already uses for every input, converts schemas to JSON Schema
(`z.toJSONSchema`). One registry of endpoints, with input, output, scopes and a description, generates:

- `/api/v1/openapi.json`;
- the reference pages in the docs;
- the MCP tool list ([section 7](#7-ai-mcp-server-agents-and-the-skill)).

There's no second copy to keep in sync.

**And the internal API?** Ticketer's own pages keep their routes, and both sets call the same commands. Pages can move
to `/api/v1` gradually where the shapes match. Nothing is rewritten in one go.

**External links** are the cheapest useful extension, copied from Linear's attachments. An app or script posts a
URL to a ticket or task, together with a title, an optional status (for example "PR open", "Deployed") and an icon.
Posting the same URL again updates the link instead of adding another. Links appear in a **Linked** section on the
ticket. This alone covers "show the GitHub PR, the Sentry issue and the Linear issue on this ticket".

### 4. Webhooks

**Format: Standard Webhooks, unchanged.**

```http
POST /ticketer/events HTTP/1.1
content-type: application/json
webhook-id: evt_01m8c3…
webhook-timestamp: 1764148443
webhook-signature: v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=

{ "type": "ticket.updated", "timestamp": "2026-11-26T09:14:03.512Z", "data": { …the event… } }
```

- The secret looks like `whsec_` plus base64. The signature is `base64(HMAC-SHA256(secret, id + "." + timestamp + "." + body))`.
  Receivers can use the official `standardwebhooks` libraries, or `svix`, in about ten languages.
- `webhook-id` is the event ID and stays the same across retries, so receivers deduplicate on it.
- **Payloads carry the snapshot after the change, plus `changes`.** Zapier- and n8n-style receivers can act without
  calling back. Apps that need the latest state should still fetch it, because delivery order isn't guaranteed.
- Snapshots are filtered by the receiver's scopes **when they're sent**: no emails without `people:read`, no internal
  notes without `notes:read`.

**Who receives.** Every webhook endpoint belongs to an app. An admin who only wants "post to n8n" creates a small
**custom app**: name, URL, events, scopes. That's one screen, and there's only one concept to learn.

**Delivery.**

| | |
| --- | --- |
| Queue | A `webhook_deliveries` table: event, endpoint, attempt, next try, last status. |
| On Node | A loop in the server process picks up due deliveries every few seconds, and immediately after each write. |
| On Cloudflare | `waitUntil` sends the first attempt. Retries are scheduled with an **alarm on the existing Durable Object**, which Nitro already exposes through the `cloudflare:durable:alarm` hook. No Queues binding, so it works on the free plan. |
| Timeout | 10 s per attempt |
| Retries | Standard Webhooks schedule, trimmed: 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 24 h, then given up |
| Success | Any 2xx. A 3xx counts as failure and redirects aren't followed. A `410` disables the endpoint. Ticketer honours `Retry-After` on `429` and `503`. |
| Auto-disable | After 3 days with no success. Admins are notified and **Turn on** sends the backlog again. |
| Log | 7 days of attempts per endpoint, with status, response time, and the first 2 KB of the response, plus a **Redeliver** button. |
| Order | Not guaranteed. Documented. |

**SSRF.** On Node, Ticketer resolves the host and refuses private, loopback and link-local addresses, unless the admin
allows them with `NUXT_APPS_ALLOW_PRIVATE_NETWORK=true`: self-hosters often run n8n on the same network. On
Cloudflare, a Worker's `fetch` reaches only public addresses unless the account sets up a tunnel.

### 5. Apps: manifest, install and bot users

**The manifest** describes an app in one JSON document, versioned from day one:

```json
{
  "manifestVersion": 1,
  "name": "Slack",
  "description": "Post new tickets to a channel and reply from Slack threads.",
  "homepage": "https://github.com/PrimalDjinn/ticketer-slack",
  "icon": "https://slack-bridge.example.com/icon.png",
  "redirectUrls": ["https://slack-bridge.example.com/ticketer/callback"],
  "scopes": ["tickets:read", "tickets:write", "conversations:read", "conversations:write"],
  "webhook": {
    "url": "https://slack-bridge.example.com/ticketer/events",
    "events": ["ticket.created", "ticket.comment.created", "conversation.message.created"]
  },
  "interactions": { "url": "https://slack-bridge.example.com/ticketer/interactions" },
  "extensions": [
    { "type": "ticket.action", "key": "share", "label": "Share to Slack…" },
    { "type": "ticket.panel", "key": "thread", "label": "Slack thread" }
  ],
  "settings": {
    "type": "object",
    "properties": { "channel": { "type": "string", "title": "Default channel" } }
  },
  "bot": { "name": "Slack", "mentionable": false, "assignable": false }
}
```

**Two ways to install.**

1. **Custom app**, the common case on a self-hosted install.
   - An admin goes to **Settings** > **Apps** > **Create app**, then pastes a manifest or fills in a form.
   - Ticketer shows the app token and webhook secret once.
   - This is like "Create an app from a manifest" in Slack. It needs no OAuth and covers "our own Slack bridge", "our n8n" and "our internal tool".
2. **Shared app**: one deployment that many Ticketer installs can add, such as a hosted Slack bridge or a Linear sync.
   - The developer serves the manifest at an HTTPS URL. **That URL is the app's `client_id`**, the same idea as OAuth and MCP client ID metadata documents, so Ticketer needs no pre-registration.
   - Install starts from **Add to Ticketer** on the app's website, which links to `https://<ticketer>/apps/install?manifest=<url>`, or from an admin pasting the URL.
   - Ticketer fetches the manifest and shows a **consent screen**: what the app can read and change, which events it receives, where it appears in the UI, and that it gets a bot user.
   - On **Allow**, Ticketer redirects to one of the manifest's `redirectUrls` with an authorization code (OAuth 2.1, PKCE). The app exchanges the code at `POST /oauth/token` for an app token and a refresh token.
   - From then on, the app can also get fresh tokens with client credentials.
   - This works on **every** install with no central registry. Plane's community edition can't do this, and it's a real gap there.

**Updates.** Ticketer re-reads a shared app's manifest daily, and when the app asks. If the app asks for **more**
(scopes, events or extensions), it keeps its old permissions until an admin approves; the **Apps** page shows "Wants
more access". Anything that asks for less, or changes only names and descriptions, applies straight away. This is
GitHub's model.

**Bot users.** Each installed app gets a user row with a new role, `app`, which is never admin. It shows as
"Slack (app)" in history, comments and activity. If the manifest says `assignable` or `mentionable`, people can assign
tickets and tasks to the app or @mention it, which is how agents work. Uninstalling turns off the bot user and keeps
it, so history still reads "Slack (app)".

**Socket mode (later, maybe).** For apps that can't receive HTTP, such as a bridge on a laptop or behind NAT, the app
could open a WebSocket to Ticketer and receive webhooks and interactions over it. The realtime hub could carry this.
It's listed as a later option because a tunnel such as Cloudflare Tunnel or ngrok covers most of these cases.

### 6. UI extensions

**Principle.** Apps never run code in Ticketer's pages. They **declare** where they appear, and when someone looks
or clicks, Ticketer asks the app's interaction URL for a small JSON document, then renders it with its own
components. This follows Slack Block Kit and Intercom Canvas Kit, rather than Zendesk-style iframes. Extensions
always look like Ticketer, follow dark mode and branding, work on phones, and can't read the page or the session.

**Version 1 extension points.** There are few, chosen for a help desk:

| Point | Where | What happens |
| --- | --- | --- |
| `ticket.action`, `conversation.action`, `task.action` | The actions menu of a ticket, chat or task | Ticketer POSTs `{ type: "action", key, subject, user }`. The app answers within 5 s with a toast, a **card** to show in a dialog (which may contain a form), or a URL to open. |
| `ticket.panel`, `conversation.panel`, `task.panel` | A card in the sidebar | Asked for when the page opens, and cached for 60 s. Examples: the customer's plan and invoices from a CRM, the linked Linear issue's state, a Slack thread link. |
| Links (API, no callback) | **Linked** section | See [external links](#3-public-api-v1). |

**Cards** are a small, versioned set of components that Ticketer renders with Nuxt UI:

```json
{
  "cardVersion": 1,
  "title": "Acme CRM",
  "blocks": [
    { "type": "fields", "items": [{ "label": "Plan", "value": "Pro" }, { "label": "MRR", "value": "$420" }] },
    { "type": "text", "markdown": "Customer since **2023**. 2 open invoices." },
    { "type": "list", "items": [{ "title": "INV-1042", "subtitle": "Overdue", "status": "warning", "url": "https://crm.example.com/inv/1042" }] },
    { "type": "actions", "items": [{ "type": "button", "label": "Extend trial", "action": "extend-trial", "style": "primary" }] }
  ]
}
```

Version 1 has these components: `text` (a markdown subset), `fields`, `list`, `badge`, `divider`, `image` (HTTPS
only, size-limited), `actions` (buttons), and form inputs (`input`, `textarea`, `select`, `checkbox`). Ticketer
ignores components it doesn't know, so it can add new ones without breaking apps. Cards are limited to 50 blocks and
32 KB.

**Requests to apps** are signed the same way as webhooks, with the same secret. They carry the acting user's ID and
name, so the app can attribute what it does. The app then acts through the API as its bot user. If the app is slow or
down, the panel shows "Couldn't load Slack" and the rest of the page is unaffected.

**Not in version 1:** iframes or custom HTML, composer slash commands, or extensions on the public pages that outside
people see. Each can be added if an app needs it, as a new extension type.

### 7. AI: MCP server, agents and the skill

**An MCP server at `/mcp`.** Remote MCP is how Claude, ChatGPT, Cursor and other agents connect to products:
Linear, Sentry, Notion, Stripe and Cloudflare all serve one.

- It uses the **2026-07-28** revision: stateless Streamable HTTP, a single `POST /mcp`.
- **Tools are generated from the same command registry as `/api/v1`**:
  - `search_tickets`, `get_ticket`, `reply_to_ticket`, `add_internal_note`, `update_ticket`;
  - `list_conversations`, `reply_to_conversation`;
  - `search_tasks`, `create_task`, `update_task`, `comment_on_task`;
  - `list_projects`, `whoami`.
- Each tool has an output schema and returns `structuredContent`. Errors give actionable text.
- **Auth**, either of two ways:
  - A personal access token as `Bearer`, for headless use and quick setup.
  - OAuth 2.1, through the same authorization server as apps. Ticketer serves `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`. Clients identify with **client ID metadata documents**, which the spec now prefers over dynamic registration. PKCE and `resource` indicators are required.
- **Tool list per caller:** a viewer's agent sees only read tools, and an agent whose token lacks `notes:read` never sees notes.
- **Destructive and public actions** carry `destructiveHint`. These include deleting, making a ticket public, and replying where outside people can read it. Like Stripe's MCP server, Ticketer can be set to answer them with a confirmation link instead of acting (`NUXT_MCP_CONFIRM_PUBLIC_REPLIES=true`).
- **Libraries:**
  - Cloudflare: `createMcpHandler` from the `agents` package. Cloudflare now marks `McpAgent` deprecated.
  - Node: the official TypeScript SDK v2 (`@modelcontextprotocol/server`).
  - A spike should check whether the SDK's web-standard transport can serve both runtimes from one Nitro route. It's likely, but unverified.

**Agents as apps** (later), following Linear and Plane, whose agent APIs are nearly identical:

- An app with `bot.assignable` or `bot.mentionable` can be **delegated** a ticket or task. The human assignee stays responsible.
- When it's mentioned or delegated, the app receives `agent.session.created` (and `agent.session.prompted` for follow-ups).
- The app reports progress as typed **activities**: `thought`, `action`, `elicitation` (a question back to the human), `response` and `error`.
- Ticketer shows these as a collapsible thread on the ticket. Only a `response` becomes a reply or note.
- Example: "@Triage, label this and suggest a reply" runs an outside agent that drafts a note for a human to send.
- Chatwoot's agent bots work similarly, with simpler hand-off states. Ticketer's conversation statuses map onto them: a bot answers while a chat is unassigned, and hands off by assigning a human.

**The skill (done in this change).** `skills/ticketer/` is an Agent Skill that teaches coding assistants the
existing integration flows, with check scripts. It installs with `npx skills add PrimalDjinn/Ticketer --skill
ticketer`. See [Use an AI coding assistant](../docs/integrate/ai-assistants.md). When `/api/v1` and webhooks ship,
the skill grows a section for them. Each Ticketer install could also serve the skill at
`/.well-known/agent-skills/index.json` with its own address already filled in. That's a small, optional addition.

**Docs for AI (done in this change).** The documentation site publishes `llms.txt` and `llms-full.txt`.

### 8. Automations

Many "plugin" requests are really rules: "when a ticket from @bigcustomer.com arrives, set it Urgent and assign Sam";
"when a task linked to a ticket is done, resolve the ticket and tell the reporter". Once there are commands and events,
**declarative automations** cover these without anyone hosting code:

- **When:** an event type.
- **If:** conditions on the event's fields, such as equals, contains or in, combined with all/any.
- **Then:** actions that are commands, such as set field, assign, add label, reply from a template, add a note, create a task, or call a webhook.

They're stored as JSON, edited in **Settings** > **Automations**, and run by the event dispatcher as `system`. A
depth limit stops loops: an automation can't trigger itself more than 3 levels deep. This is how Zendesk triggers work, and it's
the honest alternative to hosted code for most small teams.

### 9. Code inside Ticketer, and why not yet

Running other people's code inside Ticketer was researched carefully, because it's the obvious "plugin" idea.

| Option | Node | Cloudflare | Verdict |
| --- | --- | --- | --- |
| `node:vm`, Node's `--permission` flag | Yes | n/a | Node's own docs say neither is a security boundary. |
| `isolated-vm` | Yes | No | In maintenance mode. A critical sandbox escape (GHSA-864f-rcv7-6rh4) was disclosed in August 2026. |
| QuickJS compiled to WASM | Yes | Yes | The only option that runs on both. Unaudited and pre-1.0, with a slow interpreter. |
| Cloudflare Dynamic Workers | No | **Paid plan, beta** since March 2026 | The best sandbox on Cloudflare, with no Node equivalent. |
| Workers for Platforms | No | $25/month add-on, made for one SaaS operator | Wrong fit. |
| A Deno or workerd sidecar | Docker only | n/a | Needs OS-level sandboxing too, plus an extra binary to ship. Rocket.Chat went through this and backed out. |

Hosted code would mean two runtime-specific engines, a security-patching duty, and support for people's broken
scripts. In return, it would mostly do what automations and remote apps already do. **Not now.** Revisit only if
automations plus remote apps leave a clear, repeated gap. Then start with a tiny "script action" for automations
that gets only the capabilities passed to it, runs in Dynamic Workers when the binding exists, and runs in QuickJS
elsewhere.

**Trusted plugins, for people who build Ticketer themselves.** A self-hoster can already add code as a
[Nuxt layer](https://nuxt.com/docs/guide/going-further/layers) when they build their own image. That code has full
access, like Mattermost's or Backstage's plugins. The docs should say so plainly ("this code can read everything; add
only code you trust") and promise no stability for internal APIs. It's free to offer because it needs no new work.

## Examples

**Slack**, as a first-party reference app in its own repository (`ticketer-slack`), deployable to Cloudflare in one
click. It uses only public pieces:

| Feature | Built from |
| --- | --- |
| New tickets and chats posted to a channel | Webhooks `ticket.created`, `conversation.created` → Slack `chat.postMessage` |
| Replies in the Slack thread go to the ticket as internal notes, or as replies with a `/reply` prefix | Slack Events API → `POST /api/v1/tickets/{id}/comments` as the bot, naming the Slack author |
| "Share to Slack…" on a ticket | `ticket.action` extension → the app posts and answers with a toast |
| The thread link on the ticket | `POST /api/v1/tickets/{id}/links` |
| "Create ticket" from a Slack message shortcut | Slack shortcut → `POST /api/v1/tickets` |

**Linear or Plane sync** works the same way as today's GitHub sync, but outside the core. Ticketer's
`task.*` webhooks map to the Linear or Plane API, their webhooks map to `/api/v1/tasks`, and links show the other
side. Echo loops are avoided by skipping events whose `actor` is the app's own bot, which GitHub sync already does
with its `[bot]` sender check.

**Zapier, n8n and Make** need no app at all: a personal access token or a custom app with a webhook. The OpenAPI
document lets n8n's HTTP node and Zapier's API builder fill in fields. A dedicated Zapier or n8n integration would be
a thin wrapper someone can publish later.

**A CRM sidebar** is a custom app with a `ticket.panel` extension. It looks up the reporter's email (it needs
`people:read`) and returns a card.

## What happens to what exists

| Today | Under this design |
| --- | --- |
| Integration apps and `/api/integrations/v1` | **Unchanged and supported.** Embedding is its own job, signing in outside people, and its API is a contract. Later, an integration app can also be given scopes and become a full app; one table with an "embedding" capability. |
| GitHub sync | **Step 1** (with the outbox): it consumes `task.*` events instead of being called from handlers. **Step 2** (optional): becomes a first-party app on the public pieces, if the platform proves itself. That follows the Mattermost lesson without forcing a risky rewrite early. |
| Realtime events | Fed from the outbox. Browser behaviour is unchanged. |
| `task_activity` | Kept. Could later be derived from events. |
| Internal `/api/*` | Kept for Ticketer's pages. Both call the same commands. |

## Data model

New tables (SQLite and D1, as Drizzle migrations):

| Table | Holds |
| --- | --- |
| `events` | `id` (`evt_` + ULID), `type`, `occurred_at`, `actor_type`, `actor_id`, `subject_type`, `subject_id`, `data` (JSON), `changes` (JSON). Indexed by time and by subject. |
| `api_tokens` | `id`, `kind` (`personal` or `app`), `user_id` or `app_id`, `name`, `key_hash`, `key_prefix`, `scopes` (JSON), `expires_at`, `last_used_at`, `created_at`, `revoked_at` |
| `apps` | `id`, `kind` (`custom` or `shared`), `manifest_url`, `manifest` (JSON), `approved_scopes`, `pending_scopes`, `bot_user_id`, `webhook_secret` (encrypted), `settings` (JSON), `enabled`, `installed_by`, timestamps |
| `oauth_codes`, `oauth_refresh_tokens` | Short-lived codes (PKCE challenge, redirect URL, resource) and rotating refresh tokens, hashed |
| `webhook_deliveries` | `event_id`, `app_id`, `attempt`, `next_attempt_at`, `status`, `response_code`, `response_ms`, `response_excerpt` |
| `external_links` | `subject_type`, `subject_id`, `app_id`, `url` (unique per subject and app), `title`, `subtitle`, `status`, `icon_url` |
| `automations` | `id`, `name`, `enabled`, `trigger`, `conditions` (JSON), `actions` (JSON), `last_run_at`, `runs` |
| `idempotency_keys` | `token_id`, `key`, `request_hash`, `response` (JSON), `created_at` (24 hours) |

`users.role` gains `app`.

## Security

- **Least privilege by default.** Scopes intersect with roles. Apps are never admins. Internal notes and email
  addresses each need a separate, clearly labelled scope.
- **People outside the team** never receive internal notes, other people's emails, or linked tasks, through the API,
  webhooks, MCP or cards. The same rule holds today in the pages, and it becomes a test that runs against every serializer.
- **Tokens** are hashed and shown once, can expire, and can be revoked by their owner or any admin. They're logged by
  prefix only.
- **Secrets** (webhook secrets, OAuth client secrets) are encrypted with `encryptSecret`, as today's integration
  secrets are.
- **Webhooks and interactions** are signed, carry a timestamp, use HTTPS in production, and are protected against SSRF
  on Node. A 3xx counts as failure, and disabled endpoints stop at once.
- **Install consent** lists exactly what an app can do. Asking for more needs an admin again.
- **Audit:** every write by a token or app is an event with `actor`, so the history shows who did what.
- **Rate limits** per token, plus a global limit per app.
- **No third-party code inside Ticketer, and no iframes.** The biggest classes of plugin risk don't exist.

## Phases, effort and what we won't build

The estimates are for one developer who knows the codebase and works on this full time. Treat them as sizes, not
promises.

| Phase | Delivers | Size | Useful on its own? |
| --- | --- | --- | --- |
| **0. Commands and outbox** | Commands for tickets, chats and tasks. `events` table, dispatcher, realtime and notifications fed from events, GitHub sync as a consumer. | 2–3 weeks | Yes: fewer side-effect bugs, a full history |
| **1. Tokens and `/api/v1`** | Personal access tokens, the scope checks, about 25 endpoints, OpenAPI, generated reference docs | 3–4 weeks | Yes: Ticketer is scriptable |
| **2. Webhooks** | Custom apps (webhook-only), delivery engine on both runtimes, log, redeliver, auto-disable | 2 weeks | Yes: Zapier, n8n, Slack via n8n |
| **3. MCP** | `/mcp` with PAT auth, then OAuth | 1–2 weeks | Yes: Claude, ChatGPT and Cursor can work tickets |
| **4. Apps** | Manifests, shared apps with OAuth install and consent, bot users, external links | 3–4 weeks | Yes: real third-party apps |
| **5. UI extensions** | Actions, panels, card renderer, signed interaction requests | 2–3 weeks | Yes |
| **6. Agents** | Delegation, agent sessions, activity thread | 2–3 weeks | Yes |
| **7. Automations** | Rule editor and engine | 2–3 weeks | Yes, and could come right after phase 0 |
| **Reference Slack app** | Separate repository | 2 weeks | Proves the platform |

**Can we handle all of it?** Not all at once, and we don't need to. **Phases 0 to 3 take about two months**, and they're
what makes Ticketer callable from outside, by scripts, Zapier, n8n and AI agents. After that, each phase is
independent, can be stopped after, and should wait until someone needs it. The ongoing cost is mostly the **promise**
of `/api/v1`. Three things keep that cost low: a small surface, docs and types generated from one registry, and
contract tests in CI.

**What we won't build:** a marketplace, billing, iframes or custom UI, hosted third-party code, GraphQL, several
organisations per install, or Socket Mode (unless asked for).

## Open questions

1. **Full or thin webhook payloads?** This RFC proposes snapshot plus `changes`, filtered by scope. Thin payloads
   (type and ID only, as Anthropic does) are safer against stale data, but every receiver then has to call back.
2. **Should viewers have tokens?** Read-only tokens for viewers seem harmless and useful, for dashboards for example.
   This RFC allows it.
3. **Who may create personal tokens?** Everyone on the team, or only when an admin turns it on? This RFC proposes on
   by default, with an admin switch to turn it off.
4. **Can people outside the team have tokens?** Not in v1. Their integrations go through embedding.
5. **One `apps` table, or keep `integration_apps` separate?** This RFC keeps them separate at first and joins them
   later.
6. **Where should the reference Slack app live**, and who maintains it?

## Sources

Research for this RFC was done in November 2026 against official documentation:

- **Slack:**
  - [App manifests](https://docs.slack.dev/reference/app-manifest)
  - [Verifying requests](https://docs.slack.dev/authentication/verifying-requests-from-slack)
  - [Events API](https://docs.slack.dev/apis/events-api/)
  - [Interactivity](https://docs.slack.dev/interactivity/handling-user-interaction)
  - [Block Kit](https://docs.slack.dev/block-kit/)
  - [Socket Mode](https://docs.slack.dev/apis/events-api/using-socket-mode)
  - [AI apps](https://docs.slack.dev/ai/developing-ai-apps)
- **GitHub:**
  - [App manifest flow](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest)
  - [Permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
  - [Validating webhooks](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
  - [Checks](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks)
- **Linear:**
  - [OAuth and actor=app](https://linear.app/developers/oauth-2-0-authentication)
  - [Webhooks](https://linear.app/developers/webhooks)
  - [Rate limiting](https://linear.app/developers/rate-limiting)
  - [Attachments](https://linear.app/developers/attachments)
  - [Agents](https://linear.app/developers/agents)
- **Plane:**
  - [API](https://developers.plane.so/api-reference/introduction)
  - [Webhooks](https://developers.plane.so/dev-tools/intro-webhooks)
  - [Apps](https://developers.plane.so/dev-tools/build-plane-app)
  - [Scopes](https://developers.plane.so/dev-tools/build-plane-app/oauth-scopes)
  - [Agents](https://developers.plane.so/dev-tools/agents/building-an-agent)
  - [Community-edition OAuth gap](https://github.com/makeplane/plane/issues/8782)
- **Atlassian:**
  - [The future of Connect](https://www.atlassian.com/blog/developer/taking-the-ecosystem-forward-an-update-on-the-future-of-connect)
  - [Forge manifest](https://developer.atlassian.com/platform/forge/manifest-reference/)
- **Zendesk:** [Apps framework](https://developer.zendesk.com/documentation/apps/app-developer-guide/using-the-apps-framework/)
- **Intercom:** [Canvas Kit](https://developers.intercom.com/docs/canvas-kit)
- **Chatwoot:**
  - [Agent bots](https://www.chatwoot.com/docs/product/others/agent-bots/)
  - [Dashboard apps](https://www.chatwoot.com/docs/product/others/dashboard-apps/)
  - [Webhooks](https://www.chatwoot.com/docs/product/features/webhooks)
- **Twenty:** [Apps](https://docs.twenty.com/developers/extend/apps/getting-started/concepts)
- **Mattermost:**
  - [Apps framework retirement](https://forum.mattermost.com/t/transition-from-apps-framework-to-plugin-framework-in-mattermost-v10/19330)
  - [Plugin trust model](https://docs.mattermost.com/developers/integrate/plugins/using-and-managing-plugins)
- **Rocket.Chat:**
  - [Deno runtime PR](https://www.github.com/RocketChat/Rocket.Chat.Apps-engine/pull/665)
  - [Apps-Engine runtime notes](https://developer.rocket.chat/docs/apps-engine-cli)
- **Standard Webhooks:**
  - [Spec](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md)
  - [Adopters](https://www.standardwebhooks.com/)
  - [Svix retries](https://docs.svix.com/retries)
- **MCP:**
  - [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
  - [Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
  - [Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
  - [Cloudflare remote MCP](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/)
  - [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
  - [Stripe MCP](https://docs.stripe.com/mcp)
- **Sandboxing:**
  - [Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/api-reference) and its [pricing](https://developers.cloudflare.com/dynamic-workers/pricing)
  - [Workers for Platforms](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/how-workers-for-platforms-works/)
  - [node:vm](https://nodejs.org/api/vm.html)
  - [isolated-vm](https://github.com/laverdet/isolated-vm)
  - [quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
  - [Figma's plugin security update](https://madebyevan.com/figma/an-update-on-plugin-security/)
  - [Backstage threat model](https://backstage.io/docs/overview/threat-model)
  - [Directus sandbox](https://docs.directus.io/extensions/sandbox/introduction)
- **Agent Skills:**
  - [Specification](https://agentskills.io/specification)
  - [Authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
  - [skills CLI](https://github.com/vercel-labs/skills)
  - [Agent Skills discovery RFC](https://github.com/cloudflare/agent-skills-discovery-rfc)
  - [llms.txt](https://llmstxt.org/)
