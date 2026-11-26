# Working on Ticketer

Instructions for AI coding agents (and people) changing this repository. `CLAUDE.md` points here.

## Keep the docs in step: required

A change isn't done until the documentation matches it. In the **same** pull request, update every page the change
affects. If nothing needs updating, say so in the pull request description.

| If you change… | Update |
| --- | --- |
| Anything a person sees or does: a page, button, label, default, message, notification, email | The page under `docs/use/` or `docs/admin/` that describes it |
| Who may do what | `docs/reference/roles.md` |
| An environment variable or setting | `docs/reference/environment-variables.md`, `.env.example`, and the admin page for that setting |
| The integration API (`/api/integrations/v1`, `/launch`) | `docs/integrate/`, `docs/reference/integration-api.md`, and the AI skill in `skills/ticketer/` (its `references/` and recipes) |
| Deployment, Docker, Cloudflare, the build | `docs/guide/` and `README.md` |
| A new page | Add it to the sidebar in `docs/.vitepress/config.mts` and link it from a related page |
| A design decision under discussion | An RFC in `rfcs/`, not the docs |

Document only what exists. Never describe planned features as if they work.

### How the docs are written

Match the existing pages:

- Speak to the reader as "you", in the present tense, with short sentences.
- Write UI labels in bold, exactly as they appear, with `>` between steps of a path: **Settings** > **Integrations**.
- Use numbered steps for procedures and tables for options, limits and errors.
- Start task pages with what the page covers and a **Before you begin** list; end every page with **What's next**
  links.
- Use real values in examples (`https://tickets.example.com`, `jane@example.com`), never real secrets.
- Run `pnpm docs:build` after changing the docs: it fails on dead links.

## Code rules

- **Validate every input with zod** through `getValidatedQuery`, `readValidatedBody` and `getValidatedRouterParams`.
  Never cast request input to a type.
- **Both runtimes.** Server code runs on Node (Docker, libsql) and on Cloudflare Workers (D1, R2, Durable Objects).
  Use web-standard APIs (`fetch`, `crypto.subtle`) rather than Node-only ones, and test the Cloudflare build for
  anything runtime-specific.
- **People outside the team** (external users and guests) must never receive internal notes, other people's email
  addresses, or tasks linked to tickets: not in pages, API responses, realtime events, notifications or emails.
- **Database changes** go in `server/db/schema.ts` with a migration from `pnpm db:generate` in
  `server/db/migrations/sqlite/`.
- **Text people write** is rendered with `MarkdownText`, never with `v-html` of raw input.
- **Secrets** never go in the repository: no keys, tokens or passwords, including in tests and docs.
- **Keep the project generic.** Configuration for a particular deployment (domains, account IDs, email addresses)
  belongs in that deployment's environment or CI, not in this repository.

## Before you open a pull request

- `pnpm typecheck` passes.
- You ran the app (`pnpm dev`) and tried the change, including as a person outside the team when it touches tickets,
  chats or public issues.
- The docs are updated (see the top of this file).
