# Look up a person's tickets

This page shows you how your backend lists the tickets a person opened in Ticketer, so your product can show "your open
issues" with links.

## Before you begin

- An app in **Settings** > **Integrations**, and its API key. See [Connect an app](/admin/integrations).

## Send the request

Call `GET /api/integrations/v1/tickets` with the key in `Authorization: Bearer <key>` or `X-Api-Key: <key>`.

```bash
curl "https://tickets.example.com/api/integrations/v1/tickets?email=jane%40example.com&status=open" \
  -H "Authorization: Bearer $TICKETER_API_KEY"
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `email` | string | Yes | The person's email address. |
| `status` | `all`, `open` or `closed` | No | `open` means **Open** and **Pending**; `closed` means **Resolved** and **Closed**. Default: `all`. |
| `limit` | integer, 1 to 100 | No | Default: `20`. |

## Read the response

The response is a JSON array of the person's own tickets, newest first. It doesn't include public tickets that other
people opened.

```json
[
  {
    "id": 42,
    "reference": "01M8654D443K3TJR7SD844DECX",
    "title": "Export fails",
    "status": "Open",
    "urgency": "Urgent",
    "visibility": "private",
    "createdAt": "2026-11-24T06:50:43.000Z",
    "updatedAt": null,
    "url": "https://tickets.example.com/tickets/42",
    "publicUrl": null
  }
]
```

| Field | Description |
| --- | --- |
| `url` | Opens the ticket. The person must be signed in, for example through a [login link](/integrate/login-link) with `target: "ticket"` and `ticketId`. |
| `publicUrl` | The public page, which needs no sign-in. `null` unless the ticket is public. |
| `updatedAt` | `null` until the ticket changes after it was created. |

An email without an account returns an empty array. An email that belongs to someone on the team returns `409`.

## What's next

- [Create a login link](/integrate/login-link)
- [Integration API reference](/reference/integration-api)
