# Delete a person

This page shows you how your backend deletes a person's Ticketer account and data when they ask your product to erase
it. For what a deletion removes and keeps, see
[Delete accounts and personal data](/admin/delete-accounts#what-is-deleted-and-what-is-kept).

An app can only delete external people who came to Ticketer through it: people it created, people it linked by
external ID, and people it issued a login link for. It can never delete someone on the team.

::: tip
Ticketer keeps login link records for about a day after they expire. If your app signs in existing accounts, send
`externalId` (or `external_id`) with every request that signs someone in, so the person stays linked to your app and you can delete them later.
:::

## Before you begin

- The app's API key, stored on your server.
- An admin has turned on **Can delete people** for the app: **Settings** > **Integrations**, the app's actions menu,
  **Edit**, then **Can delete people** and **Save**. It's off by default. Apps with it on show a **Can delete people**
  badge.

## Send the request

Call `DELETE /api/integrations/v1/users` with the key in `Authorization: Bearer <key>` or `X-Api-Key: <key>`.

```bash
curl -X DELETE "https://tickets.example.com/api/integrations/v1/users?email=jane%40example.com&tickets=keep" \
  -H "Authorization: Bearer $TICKETER_API_KEY"
```

Replace `https://tickets.example.com` with your Ticketer address.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `email` | string | Yes | The person's email address. |
| `tickets` | `keep` or `delete` | No | `keep` (default) keeps their tickets, with "Deleted user" as the reporter. `delete` also deletes every ticket they opened, including public issues, and removes the text of their replies on other tickets. |

## Read the response

| Status | Body | Meaning |
| --- | --- | --- |
| `200` | `{ "deleted": true, "summary": { … } }` | The account was deleted. |
| `204` | None | No account uses this email. Nothing was deleted. |

`summary` counts what was removed:

```json
{
  "deleted": true,
  "summary": { "tickets": 0, "ticketsKept": 2, "comments": 0, "conversations": 1, "directMessages": 0, "files": 3 }
}
```

Because an unknown email returns `204`, you can safely repeat the call, for example from a retry queue.

## Node.js example

```js
const TICKETER_URL = 'https://tickets.example.com'

export async function deleteFromTicketer(email, { deleteTickets = false } = {}) {
  const params = new URLSearchParams({ email, tickets: deleteTickets ? 'delete' : 'keep' })
  const response = await fetch(`${TICKETER_URL}/api/integrations/v1/users?${params}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${process.env.TICKETER_API_KEY}` },
  })
  if (response.status === 204) return null // No account with this email
  const body = await response.json()
  if (!response.ok) throw new Error(`Ticketer ${response.status}: ${body.message}`)
  return body.summary
}
```

## Errors

| Status | Message | Cause |
| --- | --- | --- |
| `400` | `Validation Error` | `email` is missing or invalid, or `tickets` isn't `keep` or `delete`. |
| `401` | `Unknown API key`, or a message about the headers | The key is missing or wrong. |
| `403` | `This integration is disabled` | The app is turned off. |
| `403` | `This integration may not delete people. An admin can allow it in Settings → Integrations.` | **Can delete people** is off. |
| `403` | `This person did not come through this integration; an admin can delete them from Members` | The person has no link to this app. |
| `409` | `This person is on the team; an admin must remove them` | The email belongs to an admin, member or viewer. |

## What's next

- [Delete accounts and personal data](/admin/delete-accounts)
- [Security model](/integrate/security)
- [Integration API reference](/reference/integration-api#delete-api-integrations-v1-users)
