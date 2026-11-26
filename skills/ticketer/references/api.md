# Ticketer integration API

All paths are relative to the Ticketer address (`TICKETER_URL`). API calls take the API key in
`Authorization: Bearer <key>` or `X-Api-Key: <key>`. Bodies and responses are JSON.

## Contents

- [POST /api/integrations/v1/sessions](#post-apiintegrationsv1sessions): login link, JSON
- [GET /api/integrations/v1/sessions](#get-apiintegrationsv1sessions): login link, as a redirect
- [GET /launch (signed)](#get-launch-signed): signed launch link
- [GET /launch (prefill)](#get-launch-prefill): prefill link
- [GET /api/integrations/v1/tickets](#get-apiintegrationsv1tickets): a person's tickets
- [DELETE /api/integrations/v1/users](#delete-apiintegrationsv1users): delete a person
- [Landing targets](#landing-targets)

## POST /api/integrations/v1/sessions

Finds or creates the person's external account, optionally opens a ticket in their name, and returns a single-use
login link.

| Field | Type | Required | Limits and notes |
| --- | --- | --- | --- |
| `email` | string | Yes | Valid email. Compared in lowercase. |
| `name` | string | No | Up to 100 characters. |
| `externalId` | string | No | 1 to 200 characters. The person's ID in the product. |
| `target` | string | No | `new-ticket`, `chat`, `tickets` or `ticket`. |
| `ticketId` | integer | With `target: "ticket"` | The person's own ticket, or a public one. |
| `ticket.title` | string | With `ticket` | 1 to 140 characters. |
| `ticket.description` | string | No | Up to 8,000 characters. Default: the title. |
| `ticket.urgency` | string | No | `Default`, `Urgent` or `Emergency`. Default: `Default`. |
| `ticket.context` | object | No | Up to 30 entries. Keys 1 to 60 characters; string values up to 2,000. |
| `returnUrl` | string | No | Up to 2,000 characters. Used only if its origin is allowed for the app. |

Response `200`:

```json
{
  "url": "https://tickets.example.com/launch/3f9c…",
  "expiresAt": "2026-11-24T06:55:45.828Z",
  "userId": "01M862D3Q2F8QPEK1EBMAYJ8F2",
  "created": false,
  "ticket": { "id": 42, "reference": "01M8654D443K3TJR7SD844DECX", "url": "https://tickets.example.com/tickets/42" }
}
```

- `url` works once, until `expiresAt` (5 minutes). Redirect the browser to it.
- `created` is `true` when this call created the account.
- `ticket` is present only when you sent one. The ticket's description ends with a "Reported from" section naming
  the app and listing each `context` entry as `key: value`. The person follows the ticket; admins are notified.

How the person is found: by `externalId` if the app linked it before, then by `email`, otherwise a new external
account is created if the app **May create accounts** (else `403`).

Errors: `400`, `401`, `403`, `404` (the `ticketId` isn't theirs or public), `409` (staff, or invited to the team).

## GET /api/integrations/v1/sessions

The same as the POST, as query parameters, answering `302 Found` with `Location` set to the login link and
`Cache-Control: no-store`. The key still goes in a header, never in the URL. Errors are JSON, not redirects.

| Query parameter | Same as |
| --- | --- |
| `email`, `name`, `target` | Same names |
| `external_id` | `externalId` |
| `ticket_id` | `ticketId` |
| `title`, `description`, `urgency` | `ticket.title`, `ticket.description`, `ticket.urgency` (a ticket opens only with `title`) |
| `context[<key>]` | `ticket.context.<key>` |
| `return_url` | `returnUrl` |

Each parameter may appear only once.

## GET /launch (signed)

A browser link the product's backend signs with the signing secret. No call to Ticketer first.

Required: `app`, `email`, `ts` (Unix seconds), `nonce` (16 to 128 characters of `A-Z a-z 0-9 - _`, new for every
link), `sig` (64 hex characters). Optional: the query parameters of `GET /api/integrations/v1/sessions` above.

Accepted from 5 minutes before Ticketer's clock to 1 minute after it; each nonce once per app. On success: `302` to the
landing page with a session cookie. On failure: `302` to `/auth/login?error=launch_<reason>`.

How to compute `sig`: [signing.md](signing.md).

## GET /launch (prefill)

`/launch?app=<app id>` plus any of `title`, `description`, `urgency`, `context[<key>]`, `return_url`. Without `email`
or `sig`. Nobody is signed in: the person is already signed in, signs in, or continues as a guest, and can edit
everything before sending.

The app must exist and be turned on. Redirects to `/tickets/new` with the fields filled in. An invalid value, such as
a title over 140 characters, opens the form empty.

```html
<a href="https://tickets.example.com/launch?app=APP_ID&amp;title=Export%20fails&amp;context%5Burl%5D=https%3A%2F%2Fapp.example.com%2Freports"
   target="_blank" rel="noopener">Report a problem</a>
```

## GET /api/integrations/v1/tickets

The tickets a person opened, newest first. Public tickets other people opened aren't included.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `email` | string | Yes | |
| `status` | string | No | `all` (default), `open` (Open and Pending) or `closed` (Resolved and Closed). |
| `limit` | integer | No | 1 to 100. Default: 20. |

Response `200`, an array (empty for an email without an account):

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

- `status` is `Open`, `Pending`, `Resolved` or `Closed`.
- `url` needs the person to be signed in. To link to it from the product, make a login link with `target: "ticket"`
  and `ticketId` when they click.
- `publicUrl` opens without sign-in, and is `null` unless the ticket is public.

Errors: `400`, `401`, `403`, `409` (the email belongs to staff).

## DELETE /api/integrations/v1/users

Deletes an external person's account and data. The app needs **Can delete people**, which an admin turns on; it's off
by default. The app can delete only people who came through it: people it created, linked by `externalId`, or issued
a login link for. Ticketer keeps login-link records for about a day, so send `externalId` with every sign-in.

| Parameter | Required | Notes |
| --- | --- | --- |
| `email` | Yes | |
| `tickets` | No | `keep` (default): tickets stay, with "Deleted user" as the reporter. `delete`: also deletes every ticket they opened and the text of their replies elsewhere. |

Responses:

- `200`: `{ "deleted": true, "summary": { "tickets", "ticketsKept", "comments", "conversations", "directMessages", "files" } }`.
- `204`: no account uses the email. Safe to repeat from a retry queue.

Errors: `400`, `401`, `403` (app off, no **Can delete people**, or the person didn't come through this app), `409`
(staff).

## Landing targets

| `target` | Lands on |
| --- | --- |
| `new-ticket` | The report form |
| `chat` | The home page with the support chat open |
| `tickets` | The person's ticket list |
| `ticket` | One ticket (`ticketId`): their own or a public one |

Without a target, the person lands on the app's **Landing page** setting. If a ticket was opened, it opens that
ticket instead.
