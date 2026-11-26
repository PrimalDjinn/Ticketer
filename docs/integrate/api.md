# Use the API

This page shows you how to work with Ticketer from scripts and other tools through its REST API: read and change
tickets, support chats and tasks, and follow what happens. Calls act as you, through a personal access token.

To put a "Report a problem" button in another product for its own users, use an [integration flow](/integrate/)
instead. To get changes pushed to you as they happen, see [Receive webhooks](/integrate/webhooks).

## Before you begin

- You're on the team: an admin, member or viewer. People outside the team can't create tokens.
- Access tokens are allowed on your Ticketer. An admin can turn them off; see [Control API access](/admin/api).

## Create a token

1. Go to **Account** and find **Access tokens**.
2. Select **Create token**.
3. Enter a **Name** that says what uses it, such as "Nightly report script".
4. Choose the **Scopes**: what the token may read and change. Give only what the tool needs.
5. Choose when it **Expires**: 30 days, 90 days, 1 year or never.
6. Select **Create token**, then copy the token. It starts with `tkp_` and is shown only once.

Keep the token secret, like a password. To stop it, select **Revoke** next to it. Admins can revoke anyone's token.

## What a token can do

A call needs two things: the scope of the endpoint, and a role that allows the action. A viewer's token with
`tickets:write` still can't change tickets, because viewers can't; see [Roles and permissions](/reference/roles).
Role changes apply at once.

| Scope | Allows |
| --- | --- |
| `tickets:read`, `tickets:write` | Tickets, their replies and files |
| `notes:read`, `notes:write` | Internal notes on tickets and support chats. Without `notes:read`, notes are left out of every answer. |
| `conversations:read`, `conversations:write` | Support chats |
| `projects:read` | Projects and their boards |
| `tasks:read`, `tasks:write` | Tasks and task comments |
| `people:read` | The team list, and email addresses anywhere. Without it, `email` fields are removed from every answer. |

## Make a call

Send the token in the `Authorization` header to `https://<your Ticketer>/api/v1/…`:

```bash
curl https://tickets.example.com/api/v1/tickets?status=Open \
  -H "Authorization: Bearer $TICKETER_TOKEN"
```

Open a ticket and reply to it, in Node.js 18 or later:

```js
const TICKETER = 'https://tickets.example.com/api/v1'
const headers = { authorization: `Bearer ${process.env.TICKETER_TOKEN}`, 'content-type': 'application/json' }

const ticket = await fetch(`${TICKETER}/tickets`, {
  method: 'POST',
  headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
  body: JSON.stringify({ title: 'Disk almost full on db-2', info: 'Raised by the monitoring script.', urgency: 'Urgent' }),
}).then((r) => r.json())

await fetch(`${TICKETER}/tickets/${ticket.id}/comments`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ body: 'Cleanup scheduled for tonight.', internal: true }),
})
```

In Python, with [Requests](https://requests.readthedocs.io):

```python
import os

import requests

TICKETER = "https://tickets.example.com/api/v1"
session = requests.Session()
session.headers["Authorization"] = f"Bearer {os.environ['TICKETER_TOKEN']}"

page = session.get(f"{TICKETER}/tickets", params={"status": "Open"}, timeout=10).json()
for ticket in page["data"]:
    print(ticket["id"], ticket["title"])
```

Replace `https://tickets.example.com` with your Ticketer address.

## Endpoints

The full description, with every field and limit, is OpenAPI 3.1 at `/api/v1/openapi.json` on your Ticketer. Tools
such as Postman, Insomnia, n8n and Zapier's API builder can import it.

| Method | Path | Does | Scope |
| --- | --- | --- | --- |
| `GET` | `/me` | Who the token acts as, and its scopes | Any |
| `GET` | `/tickets` | List tickets | `tickets:read` |
| `POST` | `/tickets` | Open a ticket | `tickets:write` |
| `GET` | `/tickets/{id}` | Get a ticket with its replies, files and linked tasks | `tickets:read` |
| `PATCH` | `/tickets/{id}` | Change a ticket's status, assignee, title or visibility | `tickets:write` |
| `DELETE` | `/tickets/{id}` | Delete a ticket, its replies and files (admins) | `tickets:write` |
| `POST` | `/tickets/{id}/comments` | Reply to a ticket, or add an internal note | `tickets:write` |
| `GET` | `/conversations` | List support chats | `conversations:read` |
| `GET` | `/conversations/{id}` | Get a support chat with its messages | `conversations:read` |
| `PATCH` | `/conversations/{id}` | Assign, close or reopen a support chat | `conversations:write` |
| `POST` | `/conversations/{id}/messages` | Send a message in a support chat | `conversations:write` |
| `GET` | `/projects` | List projects | `projects:read` |
| `GET` | `/projects/{key}` | Get a project's board: statuses, tasks, labels and members | `projects:read` |
| `POST` | `/projects/{key}/tasks` | Create a task | `tasks:write` |
| `GET` | `/tasks/search` | Search tasks by reference or title | `tasks:read` |
| `GET` | `/tasks/mine` | Tasks assigned to you | `tasks:read` |
| `GET` | `/tasks/{id}` | Get a task with its comments, subtasks and activity | `tasks:read` |
| `PATCH` | `/tasks/{id}` | Change a task | `tasks:write` |
| `DELETE` | `/tasks/{id}` | Delete a task and its subtasks | `tasks:write` |
| `POST` | `/tasks/{id}/comments` | Comment on a task | `tasks:write` |
| `GET` | `/people` | The team: admins, members and viewers | `people:read` |
| `GET` | `/events` | What happened, oldest first | The area's read scope |

Answers have the same shape as what Ticketer's own pages show, so a ticket from the API looks like a ticket on screen.

## Conventions

- **JSON in and out.** Endpoints that take files (opening a ticket, replies, chat messages, task comments) also accept
  `multipart/form-data` with the same fields and up to 10 `files` of 32 MB each.
- **Lists** answer `{ "data": [...], "total": 120, "page": 1, "pageSize": 20, "nextPage": 2 }`. Ask for the next page
  with `?page=2`; `nextPage` is `null` on the last one. `pageSize` is at most 100.
- **Retries.** Send an `Idempotency-Key` header (any unique text, such as a UUID) with a JSON `POST`. If you send the
  same request with the same key again within 24 hours, Ticketer answers with the first result, marked
  `Idempotent-Replayed: true`, instead of doing it twice. The same key with a different body is refused with `422`.
- **Errors** are JSON: `{ "statusCode": 403, "message": "This token needs the \"notes:write\" scope", "data": { "code": "insufficient_scope" } }`.
  `message` says how to fix it; `data.code` is stable. Validation errors answer `400` with a list of problems in
  `message`.
- **Rate limits.** About 600 requests a minute per token by default. Every answer has `RateLimit-Limit`,
  `RateLimit-Remaining` and `RateLimit-Reset` headers; over the limit, you get `429` with `Retry-After`.
- **Versions.** `/api/v1` only grows: fields and endpoints are added, never removed or changed. A breaking change would
  come as `/api/v2`.

| Status | `data.code` | Cause |
| --- | --- | --- |
| `401` | `unauthenticated` | No token, or not a `tkp_` token. Browser session cookies don't work here. |
| `401` | `invalid_token` | The token is wrong, revoked, or its owner was deleted. |
| `401` | `token_expired` | Create a new token. |
| `403` | `tokens_disabled` | An admin turned access tokens off. |
| `403` | `insufficient_scope` | The token lacks the scope named in `message`. |
| `403` | None | Your role doesn't allow it, for example a viewer changing a ticket. |
| `404` | `not_found` | No such endpoint. Missing tickets and tasks answer `404` too, with a message. |
| `422` | `idempotency_key_reused` | The `Idempotency-Key` was used for a different request. |
| `429` | `rate_limited` | Wait for `Retry-After` seconds. |

## Follow what happens

`GET /api/v1/events` lists changes oldest first: the same events [webhooks](/integrate/webhooks) receive. Pass the
`next` value from one answer as `after` in the next call to get only what's new. Filter with
`types=ticket.created,ticket.updated`. Events are kept 30 days.

```bash
curl "https://tickets.example.com/api/v1/events?after=evt_01m8c3…&types=ticket.created" \
  -H "Authorization: Bearer $TICKETER_TOKEN"
```

Each event type needs the read scope of its area, such as `tickets:read` for `ticket.*`, and internal notes need
`notes:read`. Listing events is for the team only.

## What's next

- [Receive webhooks](/integrate/webhooks)
- [Use an AI coding assistant](/integrate/ai-assistants)
- [Roles and permissions](/reference/roles)
