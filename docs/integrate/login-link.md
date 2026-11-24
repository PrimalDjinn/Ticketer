# Create a login link

This page shows you how your backend asks Ticketer for a single-use login link, optionally opening a ticket for the
person at the same time, and sends the person's browser there.

The link signs the person in once, within 5 minutes, and lands on the target you chose.

## Before you begin

- An app in **Settings** > **Integrations**, and its API key. See [Connect an app](/admin/integrations).
- The API key stored on your server, for example in `TICKETER_API_KEY`. Never send it to a browser.
- Your Ticketer address, for example `https://tickets.example.com`.

## Request a link

Send `POST /api/integrations/v1/sessions` with the API key in the `Authorization` header (`Bearer <key>`) or in
`X-Api-Key`, and a JSON body.

```bash
curl -X POST https://tickets.example.com/api/integrations/v1/sessions \
  -H "Authorization: Bearer $TICKETER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@example.com",
    "name": "Jane Doe",
    "externalId": "user_123",
    "ticket": {
      "title": "Export fails",
      "description": "Clicking Export shows an error.",
      "urgency": "Urgent",
      "context": { "url": "https://app.example.com/reports", "plan": "Pro" }
    },
    "returnUrl": "https://app.example.com/reports"
  }'
```

Replace `https://tickets.example.com` with your Ticketer address.

A successful response has status `200`:

```json
{
  "url": "https://tickets.example.com/launch/3f9c…",
  "expiresAt": "2026-11-24T06:55:45.828Z",
  "userId": "01M862D3Q2F8QPEK1EBMAYJ8F2",
  "created": false,
  "ticket": { "id": 42, "reference": "01M8654D443K3TJR7SD844DECX", "url": "https://tickets.example.com/tickets/42" }
}
```

Redirect the browser to `url`. `ticket` is present only when you sent one; `created` is `true` when this call created
the account.

## Body fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `email` | string | Yes | The person's email address. |
| `name` | string, up to 100 characters | No | Display name. Used to suggest a username for a new account. |
| `externalId` | string, 1 to 200 characters | No | The person's ID in your app. Links the account to it, so the person is still found if their email changes. |
| `target` | `new-ticket`, `chat`, `tickets` or `ticket` | No | Where to land. Default: the app's landing page, or the new ticket if you send one. |
| `ticketId` | positive integer | With `target: "ticket"` | The ticket to open. It must be the person's own ticket or a public one. |
| `ticket.title` | string, 1 to 140 characters | With `ticket` | Ticket title. |
| `ticket.description` | string, up to 8,000 characters | No | Ticket description. Default: the title. |
| `ticket.urgency` | `Default`, `Urgent` or `Emergency` | No | Default: `Default`. |
| `ticket.context` | object of strings | No | Up to 30 entries; keys up to 60 characters, values up to 2,000. |
| `returnUrl` | URL, up to 2,000 characters | No | Shown as a **Back to** link. Ignored unless its origin is one of the app's allowed return origins. |

With `ticket`, Ticketer opens the ticket in the person's name, makes them follow it, and notifies admins. The
description ends with a "Reported from" section that names your app and lists each `context` entry as `key: value`.

## How the person is found

1. By `externalId`, if your app linked it before.
2. By `email`.
3. Otherwise, a new external account is created, if the app **May create accounts**. Otherwise the call fails with
   `403`.

If the person is on the team (admin, member or viewer), or has a pending invitation to the team, the call fails with
`409`.

## Node.js example

Run this on your server, never in the browser. It needs Node.js 18 or later for the built-in `fetch`.

```js
const TICKETER_URL = 'https://tickets.example.com'

export async function ticketerLoginLink(user, report) {
  const response = await fetch(`${TICKETER_URL}/api/integrations/v1/sessions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.TICKETER_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: user.email,
      name: user.name,
      externalId: String(user.id),
      ticket: report && { title: report.title, description: report.description, context: { url: report.url } },
      returnUrl: report?.url,
    }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`Ticketer ${response.status}: ${body.message}`)
  return body.url // Redirect the browser here within 5 minutes. It works once.
}
```

## Python example

This example uses the [Requests](https://requests.readthedocs.io) library.

```python
import os

import requests

TICKETER_URL = "https://tickets.example.com"


def ticketer_login_link(user, report=None):
    body = {"email": user["email"], "name": user["name"], "externalId": str(user["id"])}
    if report:
        body["ticket"] = {
            "title": report["title"],
            "description": report["description"],
            "context": {"url": report["url"]},
        }
        body["returnUrl"] = report["url"]
    response = requests.post(
        f"{TICKETER_URL}/api/integrations/v1/sessions",
        headers={"Authorization": f"Bearer {os.environ['TICKETER_API_KEY']}"},
        json=body,
        timeout=10,
    )
    if not response.ok:
        raise RuntimeError(f"Ticketer {response.status_code}: {response.json()['message']}")
    return response.json()["url"]  # Redirect the browser here within 5 minutes. It works once.
```

## What the person sees

When the browser opens the link, Ticketer signs the person in and redirects to the target. If the link was already
used, has expired, or the app was turned off, the person lands on the sign-in page with an explanation. See
[Errors](/integrate/errors#browser-link-errors).

## What's next

- [Redirect with an API key](/integrate/redirect)
- [Errors](/integrate/errors)
- [Integration API reference](/reference/integration-api)
