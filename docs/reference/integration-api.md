# Integration API reference

This page describes every endpoint a connected app can call. For task-oriented guides, see
[Integrate your app](/integrate/).

## Authentication

API endpoints under `/api/integrations/v1/` need the app's API key in one of these headers:

```http
Authorization: Bearer tkt_<48 hex characters>
X-Api-Key: tkt_<48 hex characters>
```

The browser endpoints under `/launch` take no key. Signed links carry an HMAC signature instead; see
[Signed launch links](/integrate/signed-links).

Errors from API endpoints are JSON objects with `statusCode` and `message`. See [Errors](/integrate/errors).

## POST /api/integrations/v1/sessions

Finds or creates the external account for a person, optionally opens a ticket for them, and returns a single-use login
link.

**Auth:** API key.

**Request body** (JSON):

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `email` | string | Yes | A valid email address. Compared in lowercase. |
| `name` | string | No | Up to 100 characters. |
| `externalId` | string | No | 1 to 200 characters. |
| `target` | string | No | `new-ticket`, `chat`, `tickets` or `ticket`. |
| `ticketId` | integer | With `target: "ticket"` | Positive. The person's own ticket, or a public one. |
| `ticket` | object | No | Opens a ticket in the person's name. |
| `ticket.title` | string | With `ticket` | 1 to 140 characters. |
| `ticket.description` | string | No | Up to 8,000 characters. |
| `ticket.urgency` | string | No | `Default`, `Urgent` or `Emergency`. Default: `Default`. |
| `ticket.context` | object | No | Up to 30 entries. Keys 1 to 60 characters, string values up to 2,000 characters. |
| `returnUrl` | string | No | A URL up to 2,000 characters. Kept only if its origin is in the app's allowed return origins. |

**Response:** `200 OK`

| Field | Type | Description |
| --- | --- | --- |
| `url` | string | Login link, `<origin>/launch/<token>`. Works once. |
| `expiresAt` | string | ISO 8601 time when `url` expires, 5 minutes after it was issued. |
| `userId` | string | The person's Ticketer user ID. |
| `created` | boolean | `true` if this call created the account. |
| `ticket` | object | Only when `ticket` was sent: `id` (number), `reference` (string), `url` (string). |

**Landing page:** `target` if given; otherwise the new ticket if one was opened; otherwise the app's landing page.

**Errors:** `400`, `401`, `403`, `404`, `409`.

## GET /api/integrations/v1/sessions

The same as `POST /api/integrations/v1/sessions`, with query parameters, answering with a redirect.

**Auth:** API key, in a header.

**Query parameters:** `email` (required), `name`, `external_id`, `target`, `ticket_id`, `title`, `description`,
`urgency`, `context[<key>]`, `return_url`. Limits match the POST body. A ticket is opened only when `title` is
present. Each parameter may appear only once.

**Response:** `302 Found` with `Location` set to the login link and `Cache-Control: no-store`.

**Errors:** `400`, `401`, `403`, `404`, `409`, as JSON.

## GET /api/integrations/v1/tickets

Lists the tickets a person opened, newest first.

**Auth:** API key.

**Query parameters:**

| Parameter | Type | Required | Limits |
| --- | --- | --- | --- |
| `email` | string | Yes | A valid email address. |
| `status` | string | No | `all` (default), `open` (Open and Pending) or `closed` (Resolved and Closed). |
| `limit` | integer | No | 1 to 100. Default: 20. |

**Response:** `200 OK`, a JSON array. An email without an account returns `[]`.

| Field | Type | Description |
| --- | --- | --- |
| `id` | number | Ticket ID. |
| `reference` | string | Ticket reference. |
| `title` | string | Title. |
| `status` | string | `Open`, `Pending`, `Resolved` or `Closed`. |
| `urgency` | string | `Default`, `Urgent` or `Emergency`. |
| `visibility` | string | `private` or `public`. |
| `createdAt` | string | ISO 8601. |
| `updatedAt` | string or null | ISO 8601, or `null` if never updated. |
| `url` | string | `<origin>/tickets/<id>`. Needs the person to be signed in. |
| `publicUrl` | string or null | `<origin>/issues/<reference>` for public tickets, otherwise `null`. |

**Errors:** `400`, `401`, `403`, `409`.

## DELETE /api/integrations/v1/users

Deletes an external person's account and data. See [Delete a person](/integrate/delete-people) and
[what is deleted and kept](/admin/delete-accounts#what-is-deleted-and-what-is-kept).

**Auth:** API key. The app needs **Can delete people** (`canDelete`), which is off by default.

**Query parameters:**

| Parameter | Type | Required | Limits |
| --- | --- | --- | --- |
| `email` | string | Yes | A valid email address. |
| `tickets` | string | No | `keep` (default) or `delete`. |

**Response:**

- `200 OK`: `{ "deleted": true, "summary": { "tickets", "ticketsKept", "comments", "conversations", "directMessages", "files" } }`,
  each a count.
- `204 No Content`: no account uses the email. Repeating a deletion is safe.

**Errors:** `400`, `401`, `403` (app disabled, no **Can delete people**, or the person didn't come through this app),
`409` (the person is on the team).

## GET /launch (signed)

Signs a person in from a link your backend signed, optionally opens a ticket, and redirects.

**Auth:** HMAC-SHA256 signature in `sig`.

**Query parameters:** `app`, `email`, `ts`, `nonce` and `sig` (all required), plus the optional parameters of
`GET /api/integrations/v1/sessions`.

| Parameter | Limits |
| --- | --- |
| `app` | `app_` followed by 26 lowercase letters or digits. |
| `ts` | Unix seconds. Accepted from 5 minutes before now to 1 minute after now. |
| `nonce` | 16 to 128 characters from `A-Z a-z 0-9 - _`. Accepted once per app. |
| `sig` | 64 hex characters. |

**Response:** `302 Found` to the landing page, with a session cookie. On failure, `302 Found` to
`/auth/login?error=launch_<reason>`.

## GET /launch (prefill)

Opens the report form with fields filled in. Nobody is signed in. Used when neither `email` nor `sig` is present.

**Auth:** None. The app must exist and be turned on.

**Query parameters:** `app` (required), `title`, `description`, `urgency`, `context[<key>]`, `return_url`.

**Response:** `302 Found` to `/tickets/new` with the fields as query parameters. On failure, `302 Found` to
`/auth/login?error=launch_<reason>`.

## GET /launch/{token}

Redeems a login link from `POST` or `GET /api/integrations/v1/sessions`.

**Auth:** The token in the path: 64 hex characters, valid once, for 5 minutes.

**Response:** `302 Found` to the landing page, with a session cookie. On failure, `302 Found` to
`/auth/login?error=launch_<reason>`.

## What's next

- [Choose a flow](/integrate/)
- [Errors](/integrate/errors)
- [Security model](/integrate/security)
