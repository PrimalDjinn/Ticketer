# Ticketer webhooks

An admin adds the receiver in **Settings > Webhooks**: address (https), events, and whether internal notes and email
addresses may be sent. Ticketer shows a signing secret `whsec_…` once. Store it as `TICKETER_WEBHOOK_SECRET`.

## Request

`POST` with `Content-Type: application/json` and the Standard Webhooks headers `webhook-id` (the event ID, stable
across retries), `webhook-timestamp` (Unix seconds) and `webhook-signature` (`v1,<base64>`). Body:

```json
{
  "type": "ticket.updated",
  "timestamp": "2026-11-26T09:14:03.512Z",
  "data": {
    "id": "evt_…",
    "type": "ticket.updated",
    "occurredAt": "2026-11-26T09:14:03.512Z",
    "actor": { "type": "user", "id": "…", "name": "alice" },
    "subject": { "type": "ticket", "id": "42" },
    "data": { "id": 42, "title": "…", "status": "Pending" },
    "changes": { "status": { "from": "Open", "to": "Pending" } }
  }
}
```

`actor.type` is `user`, `app` (an integration or GitHub sync) or `system`. `changes` is set on `*.updated` events.
Events: `ticket.created|updated|deleted`, `ticket.comment.created|deleted` (`data.internal` marks notes),
`conversation.created|updated`, `conversation.message.created`, `project.updated|deleted`,
`task.created|updated|deleted`, `task.comment.created|deleted`, and `webhook.test`.

## Verify, then answer fast

Verify the **raw** body with the `standardwebhooks` library before parsing it. Never verify re-serialized JSON.

```js
import express from 'express'
import { Webhook } from 'standardwebhooks'

const webhook = new Webhook(process.env.TICKETER_WEBHOOK_SECRET)
app.post('/ticketer', express.raw({ type: 'application/json' }), (req, res) => {
  let event
  try {
    event = webhook.verify(req.body.toString('utf8'), req.headers)
  } catch {
    return res.status(401).send('Bad signature')
  }
  res.sendStatus(204)
  handle(event).catch(console.error)
})
```

```python
from standardwebhooks.webhooks import Webhook

webhook = Webhook(os.environ["TICKETER_WEBHOOK_SECRET"])
event = webhook.verify(request.get_data(), dict(request.headers))  # raises if invalid
```

By hand: HMAC-SHA256 of `"{webhook-id}.{webhook-timestamp}.{raw body}"`, keyed with the base64-decoded part of the
secret after `whsec_`, base64-encoded, compared in constant time with each `v1,` entry of `webhook-signature`. Reject
timestamps more than 5 minutes from now.

## Delivery rules

- Answer `2xx` within 10 seconds; do slow work afterwards. Redirects count as failures.
- Retries after 1 min, 5 min, 30 min, 2 h, 5 h, 10 h, 24 h. Answer `410` to make Ticketer turn the webhook off.
- Deliveries may repeat and arrive out of order: deduplicate on `webhook-id`, and fetch the latest state from the API
  when order matters.
- Ticketer refuses private and local addresses unless the server has `NUXT_WEBHOOKS_ALLOW_PRIVATE_NETWORK=true`. For
  local development, use a tunnel (for example `cloudflared tunnel --url http://localhost:3000`).
