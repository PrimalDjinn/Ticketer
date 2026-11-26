# Ticketer REST API (`/api/v1`)

For scripts and tools that act for someone on the team. Base URL: `<TICKETER_URL>/api/v1`. The full schema, with
every field and limit, is OpenAPI 3.1 at `<TICKETER_URL>/api/v1/openapi.json` (no token needed).

## Contents

- [Authentication and scopes](#authentication-and-scopes)
- [Endpoints](#endpoints)
- [Conventions](#conventions)
- [Errors](#errors)
- [Polling events](#polling-events)

## Authentication and scopes

`Authorization: Bearer tkp_<40 hex>`. Someone on the team (admin, member or viewer) creates the token under
**Account > Access tokens**; it's shown once. Browser cookies are never accepted on `/api/v1`.

A call needs the endpoint's scope **and** a role that allows the action: a viewer's token can't change anything.

| Scope | Allows |
| --- | --- |
| `tickets:read`, `tickets:write` | Tickets, replies, files |
| `notes:read`, `notes:write` | Internal notes on tickets and chats (left out of answers without `notes:read`) |
| `conversations:read`, `conversations:write` | Support chats |
| `projects:read` | Projects and boards |
| `tasks:read`, `tasks:write` | Tasks and task comments |
| `people:read` | The team list and every `email` field (removed from answers without it) |

`GET /me` returns `{ user, scopes }`: call it first to check the token.

## Endpoints

| Method | Path | Does | Scope |
| --- | --- | --- | --- |
| `GET` | `/me` | Who the token acts as, and its scopes | Any |
| `GET` | `/tickets` | List: `status`, `q`, `assignee` (`me`, `none` or a user ID), `visibility`, `from`, `to`, `page`, `pageSize` | `tickets:read` |
| `POST` | `/tickets` | Open: `title` (≤140), `info` (≤10,000), `urgency` (`Default`, `Urgent`, `Emergency`), `visibility` (`private`, `public`; team only) | `tickets:write` |
| `GET` | `/tickets/{id}` | One ticket with `comments`, `attachments`, `tasks` | `tickets:read` |
| `PATCH` | `/tickets/{id}` | `status` (`Open`, `Pending`, `Resolved`, `Closed`), `assigneeId`, `title`, `visibility` | `tickets:write` |
| `DELETE` | `/tickets/{id}` | Delete (admins only) | `tickets:write` |
| `POST` | `/tickets/{id}/comments` | `body`, `internal` (needs `notes:write`), `parentId`, `mentions` (user IDs) | `tickets:write` |
| `GET` | `/conversations` | Support chats: `status`, `assignee`, `q`, `page`, `pageSize` | `conversations:read` |
| `GET` | `/conversations/{id}` | One chat with `messages` | `conversations:read` |
| `PATCH` | `/conversations/{id}` | Assign, close, reopen | `conversations:write` |
| `POST` | `/conversations/{id}/messages` | `body`, `internal` (needs `notes:write`) | `conversations:write` |
| `GET` | `/projects` | Projects | `projects:read` |
| `GET` | `/projects/{key}` | Board: `project` (with `statuses`), `tasks`, `labels`, `members` | `projects:read` |
| `POST` | `/projects/{key}/tasks` | Create: `title`, plus optional `description`, `statusId`, `assigneeId`, `priority`, dates, `labelIds`… | `tasks:write` |
| `GET` | `/tasks/search?q=` | Find tasks by reference (`WEB-12`) or title | `tasks:read` |
| `GET` | `/tasks/mine` | Tasks assigned to the token's owner | `tasks:read` |
| `GET` | `/tasks/{id}` | One task with comments, subtasks, activity | `tasks:read` |
| `PATCH` | `/tasks/{id}` | Change fields, e.g. `statusId`, `assigneeId`, `priority` (`urgent`, `high`, `medium`, `low`, `none`) | `tasks:write` |
| `DELETE` | `/tasks/{id}` | Delete with subtasks | `tasks:write` |
| `POST` | `/tasks/{id}/comments` | `body`, `parentId`, `mentions` | `tasks:write` |
| `GET` | `/people` | The team (for assignee and mention IDs) | `people:read` |
| `GET` | `/events` | Changes, oldest first (see below) | Area's read scope |

Ticket and task IDs are numbers; user IDs are strings. Status IDs come from `GET /projects/{key}`.

## Conventions

- JSON bodies. Endpoints that take files also accept `multipart/form-data` with the same fields plus up to 10 `files`.
- Lists answer `{ data, total, page, pageSize, nextPage }`; ask for `?page=<nextPage>` until it's `null`.
- `Idempotency-Key: <unique text>` on a JSON POST: the same key and body within 24 hours replays the first answer
  (`Idempotent-Replayed: true`) instead of acting twice. Generate one key per logical action and reuse it on retries.
- About 600 requests per minute per token; `RateLimit-Remaining` and `RateLimit-Reset` headers; `429` with
  `Retry-After` when over.
- `/api/v1` only grows; fields are never removed.

## Errors

JSON: `{ statusCode, message, data: { code } }`. `message` says how to fix it.

| Status | `data.code` | Fix |
| --- | --- | --- |
| `401` | `unauthenticated`, `invalid_token`, `token_expired` | Send a valid `tkp_` token; create a new one if expired |
| `403` | `tokens_disabled` | An admin turned tokens off (Settings > API) |
| `403` | `insufficient_scope` | Create a token with the scope named in `message` |
| `403` | none | The owner's role can't do it (viewers can't change anything) |
| `404` | `not_found` or none | Wrong path, or the ticket or task doesn't exist or isn't visible |
| `422` | `idempotency_key_reused` | New key for a different request |
| `429` | `rate_limited` | Wait `Retry-After` seconds |

## Polling events

`GET /events?after=<id>&types=ticket.created,ticket.updated&limit=50` answers `{ data: [event…], next }`. Store `next`
and pass it as `after` next time. Events are kept 30 days and have the same shape as webhook events
([webhooks.md](webhooks.md)). Prefer webhooks when the receiver has a public address; poll when it doesn't.
