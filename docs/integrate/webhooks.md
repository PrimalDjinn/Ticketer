# Receive webhooks

This page shows you how to receive Ticketer's webhooks: what Ticketer sends when tickets, support chats, projects and
tasks change, how to check that a request really came from Ticketer, and what happens when your receiver fails.

Webhooks follow the [Standard Webhooks](https://www.standardwebhooks.com) format, so the official `standardwebhooks`
libraries verify them in most languages. n8n, Zapier and Make can receive them with their webhook triggers.

## Before you begin

- An admin adds the webhook in **Settings** > **Webhooks** with your receiver's address and the events you want. See
  [Send events to other tools](/admin/webhooks).
- You have the webhook's signing secret. It starts with `whsec_` and is shown when the webhook is created or its secret
  is rotated.

## What Ticketer sends

Each event is a `POST` with a JSON body:

```http
POST /ticketer HTTP/1.1
Content-Type: application/json
User-Agent: Ticketer-Webhooks/1
webhook-id: evt_01m8c3b7k2q9x4v6n8p0r2t4w6
webhook-timestamp: 1764148443
webhook-signature: v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=

{
  "type": "ticket.updated",
  "timestamp": "2026-11-26T09:14:03.512Z",
  "data": {
    "id": "evt_01m8c3b7k2q9x4v6n8p0r2t4w6",
    "type": "ticket.updated",
    "occurredAt": "2026-11-26T09:14:03.512Z",
    "actor": { "type": "user", "id": "01M7…", "name": "alice" },
    "subject": { "type": "ticket", "id": "42" },
    "data": { "id": 42, "title": "Export fails", "status": "Pending", "assigneeId": "01M7…", "…": "…" },
    "changes": { "status": { "from": "Open", "to": "Pending" } }
  }
}
```

| Field | Meaning |
| --- | --- |
| `data.id` | The event's ID, the same as `webhook-id`. Use it to ignore an event you've already handled. |
| `data.actor` | Who did it: `user`, `app` (an integration or GitHub sync, with its name) or `system` (scheduled jobs). |
| `data.subject` | What changed: its type and ID. |
| `data.data` | The subject after the change, as the team sees it on screen. |
| `data.changes` | For `*.updated` events: each top-level field that changed, with `from` and `to`. `null` otherwise. |

## Events

| Event | When |
| --- | --- |
| `ticket.created` | A ticket is opened, by anyone, from anywhere. |
| `ticket.updated` | Status, assignee, title, urgency or visibility changes. Replies that move the status count too. |
| `ticket.deleted` | A ticket is deleted. `data` has its `id`. |
| `ticket.comment.created` | A reply or internal note is added to a ticket. `data.internal` says which. |
| `ticket.comment.deleted` | A reply is deleted. |
| `conversation.created` | A support chat starts. |
| `conversation.updated` | A chat is assigned, closed or reopened. |
| `conversation.message.created` | A message or internal note is sent in a chat. |
| `project.updated`, `project.deleted` | A project's name, statuses or fields change, or it's deleted. |
| `task.created`, `task.updated`, `task.deleted` | Tasks change, including through GitHub sync. |
| `task.comment.created`, `task.comment.deleted` | Task comments. |
| `webhook.test` | **Send a test event** in Settings. Not retried. |

Internal notes are sent only if the admin turned on **Send internal notes** for the webhook. Email addresses are
removed from every event unless **Send email addresses** is on.

## Check the signature

Always check the signature before you trust a request. Use the raw request body, exactly as received: parsing and
re-serialising the JSON changes it.

The signature is `v1,` followed by the base64 HMAC-SHA256 of `webhook-id.webhook-timestamp.body`, keyed with the secret
without its `whsec_` prefix, base64-decoded. Reject requests whose timestamp is more than 5 minutes away from now.

With the official library in Node.js (`npm install standardwebhooks`), for example in Express:

```js
import express from 'express'
import { Webhook } from 'standardwebhooks'

const app = express()
const webhook = new Webhook(process.env.TICKETER_WEBHOOK_SECRET) // whsec_…

app.post('/ticketer', express.raw({ type: 'application/json' }), (req, res) => {
  let event
  try {
    event = webhook.verify(req.body.toString('utf8'), req.headers)
  } catch {
    return res.status(401).send('Bad signature')
  }
  res.sendStatus(204) // answer quickly, then do the work
  handle(event).catch(console.error)
})
```

In Python (`pip install standardwebhooks`), for example in Flask:

```python
import os

from flask import Flask, request
from standardwebhooks.webhooks import Webhook

app = Flask(__name__)
webhook = Webhook(os.environ["TICKETER_WEBHOOK_SECRET"])


@app.post("/ticketer")
def ticketer():
    try:
        event = webhook.verify(request.get_data(), dict(request.headers))
    except Exception:
        return "Bad signature", 401
    handle(event)
    return "", 204
```

Libraries for Go, Ruby, PHP, Java, C# and Rust are listed at
[standardwebhooks.com](https://www.standardwebhooks.com).

## Answer, retries and turning off

- Answer with any `2xx` within 10 seconds. Do slow work after answering.
- Anything else is a failure, including redirects, which Ticketer doesn't follow.
- A failed delivery is tried again 1 minute, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours and 24 hours later,
  then given up. The `webhook-id` stays the same; the timestamp and signature are new each time.
- Answer `410 Gone` to stop all deliveries: Ticketer turns the webhook off.
- If every delivery fails for 3 days, Ticketer turns the webhook off and tells the admins.
- Events can arrive out of order, and more than once. Use `webhook-id` to skip duplicates, and `data.occurredAt` or a
  fresh `GET` from the [API](/integrate/api) when order matters.

Admins can see the last 50 deliveries to each webhook, with the answers, and send any of them again, in
**Settings** > **Webhooks**.

## What's next

- [Use the API](/integrate/api)
- [Send events to other tools](/admin/webhooks)
