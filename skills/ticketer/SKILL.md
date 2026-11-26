---
name: ticketer
description: Connects a product to a Ticketer help desk. Adds "Report a problem" and "Contact support" buttons that sign the product's users in to Ticketer, open prefilled tickets, start a support chat, list a user's tickets, and delete a user's Ticketer data on request. Use when the user mentions Ticketer, or asks to add a help desk, support, feedback or bug-report button backed by Ticketer, or to call the Ticketer integration API.
license: Apache-2.0
metadata:
  version: "1.0"
  docs: https://primaldjinn.github.io/Ticketer/integrate/
---

# Integrate a product with Ticketer

Ticketer is a self-hosted help desk. Each install has its own address, such as `https://tickets.example.com`. A
product connects to it as an **app** that an admin creates in Ticketer under **Settings > Integrations**. The app
has three credentials:

| Credential | Looks like | Secret | Used for |
| --- | --- | --- | --- |
| App ID | `app_` + 26 lowercase letters or digits | No | Browser links |
| API key | `tkt_` + 48 hex characters | Yes | Server-to-server calls |
| Signing secret | `tks_` + 64 hex characters | Yes | Signing browser links |

## Before you write code

Ask the user for anything you don't know. Don't guess or invent values:

1. The Ticketer address. It's different for every install.
2. Which credentials they have. If they have none, tell them to have an admin create an app under **Settings >
   Integrations** (guide: https://primaldjinn.github.io/Ticketer/admin/integrations). The admin adds the product's
   origin to **Allowed return origins** if they want a **Back to** link.
3. What the button should do: open a report form, open a support chat, show the person's tickets, or something else.

Store the values in the server's environment as `TICKETER_URL`, `TICKETER_APP_ID`, `TICKETER_API_KEY` and
`TICKETER_SIGNING_SECRET`. Add them to `.env.example`, empty or with placeholder values, never real ones.

## Choose a flow

| The product wants to… | Flow | Needs |
| --- | --- | --- |
| Sign the person in and get JSON back, such as the new ticket's ID | Login link: `POST /api/integrations/v1/sessions` | API key |
| Sign the person in without calling Ticketer first | Signed launch link: `GET /launch?…&sig=…` | Signing secret |
| Sign the person in when the backend can only pass on a redirect | `GET /api/integrations/v1/sessions` (answers `302`) | API key |
| Open a prefilled report form, without signing anyone in | Prefill link: `GET /launch?app=…&title=…` | App ID only |
| Show "your open issues" inside the product | `GET /api/integrations/v1/tickets?email=…` | API key |
| Delete the person's Ticketer data when they delete their account | `DELETE /api/integrations/v1/users?email=…` | API key, and **Can delete people** turned on for the app |

Default to the **login link** when the product has a backend that can make an HTTPS call. Use the **signed launch
link** when it can't, or when the extra call is unwelcome. Use a **prefill link** for static sites or when the person
shouldn't be signed in. Read [references/api.md](references/api.md) for every field, limit and response.

## Rules

- Keep the API key and the signing secret on the server. Never put them in browser code, mobile apps, URLs, logs or
  version control.
- Every flow that signs someone in works only for people **outside** the team. If the email belongs to an admin,
  member or viewer of Ticketer, Ticketer answers `409` or `launch_team`. Show a plain "Sign in to Ticketer directly"
  message instead of retrying.
- Make the link when the person clicks, not when the page renders. A login link works **once**, within **5 minutes**.
  A signed link expires 5 minutes after its `ts`.
- Opening a ticket changes data, so do it from a `POST` (a form submit or a `fetch`), never from a `GET` that a
  crawler, link preview or prefetcher could follow. In Next.js, use a plain `<a>` or a `<form>` for these routes, not
  `<Link>`, which prefetches.
- Send `externalId` (or `external_id`) with every sign-in. It's the person's ID in the product. It keeps the account
  linked when their email changes, and lets the app delete the person later.
- Put useful context in `ticket.context`, such as the page URL, plan, app version and browser: up to 30 entries,
  values up to 2,000 characters. Never put passwords, tokens or payment details there. Support staff can read it.
- Call only `/api/integrations/v1/*` and `/launch`. Other `/api/*` routes serve Ticketer's own pages: they use the
  browser session, change without notice, and aren't for integrations.

## Build it

1. Add a server route for each button, for example `POST /support/report` and `GET /support/chat`. It reads the
   signed-in user from the product's own session.
2. In the route, get a login link or build a signed link, then redirect the browser to it with `302` or `303`.
3. Add the button to the UI. It points at the product's route, never directly at Ticketer with secrets.
4. If the product shows the person's tickets, call `GET /api/integrations/v1/tickets` on the server and render the
   titles, statuses and `url` links.

Ready-made code for Node.js, Next.js, Express, Python (Flask and Django), PHP (Laravel) and Ruby (Rails) is in
[references/recipes.md](references/recipes.md). Signing details and a worked example are in
[references/signing.md](references/signing.md).

## Check it works

1. **API key:** run `scripts/check-key.sh`. It calls the ticket list for an address that can't exist. A valid key
   answers `200 []` and creates nothing.
2. **Signature code:** run `node scripts/check-signature.mjs`. It prints the canonical string and signature for the
   worked example. Your code must produce exactly the same two strings for the same input. Then run it with your own
   parameters, as its `--help` describes, and compare again.
3. **End to end:** sign in to the product as a test user whose email isn't on the Ticketer team, click the button,
   and check that Ticketer opens on the right page, signed in as that user. The new ticket must show your context
   under "Reported from".
4. Click the button twice. Each click must make a fresh link.

## When something fails

API errors are JSON with `statusCode` and `message`. Browser links never show an error page: they redirect to
`/auth/login?error=launch_<reason>`. The common ones:

| Symptom | Cause | Fix |
| --- | --- | --- |
| `401 Unknown API key` | Wrong or rotated key | Use the current key |
| `403 This integration is disabled` | An admin turned the app off | Ask an admin |
| `403 … may not create accounts` | The app can only sign in existing accounts | Ask an admin to allow it, or invite the person |
| `409 This person is on the team` | The email or `externalId` belongs to staff | Don't send staff through the integration |
| `launch_signature` | Encoding or parameter mismatch | Compare with `scripts/check-signature.mjs` |
| `launch_expired` | Link older than 5 minutes, or server clock wrong | Make links on click; sync the clock |
| `launch_used`, `launch_replayed` | Link opened twice, or a nonce reused | New link and nonce for every click |
| No **Back to** link | `returnUrl` origin isn't allowed for the app | Ask an admin to add the origin |

The full list is in [references/errors.md](references/errors.md).

## What Ticketer doesn't offer yet

There's no public API yet for staff work such as listing every ticket, replying as an agent, managing projects and
tasks, or subscribing to webhooks. Don't work around this by scraping pages or calling internal `/api/*` routes with a
staff session. Tell the user it isn't available, and point them to
https://github.com/PrimalDjinn/Ticketer/issues if they want to request it.
