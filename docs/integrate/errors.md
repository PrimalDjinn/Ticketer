# Handle integration errors

This page lists the errors the integration API returns and the error codes a browser link can end in, with their
causes and fixes.

## API errors

The API endpoints (`/api/integrations/v1/…`) return errors as JSON with the HTTP status code:

```json
{
  "error": true,
  "url": "https://tickets.example.com/api/integrations/v1/sessions",
  "statusCode": 409,
  "statusMessage": "Server Error",
  "message": "This person is on the team; they must sign in directly"
}
```

Read `statusCode` and `message`. For validation errors (`400` with `statusMessage` `Validation Error`), `message` is a
JSON-encoded list of problems, each with a `path` and a `message`.

| Status | Message | Cause | Fix |
| --- | --- | --- | --- |
| `400` | `Validation Error` | A body field or query parameter is missing or invalid, or a query parameter is repeated. | Check the [limits](/reference/integration-api). |
| `400` | `target "ticket" needs ticketId` | `target` is `ticket` without `ticketId`. | Send `ticketId` (or `ticket_id`). |
| `401` | `Send the API key as "Authorization: Bearer <key>" or "X-Api-Key: <key>"` | No key, or a value that isn't shaped like a key. | Send the key in one of the two headers. |
| `401` | `Unknown API key` | The key is wrong, or was rotated. | Use the current key. |
| `403` | `This integration is disabled` | An admin turned the app off. | Ask an admin to turn it on. |
| `403` | `No account uses this email, and this integration may not create accounts` | The app may not create accounts. | Ask an admin to allow it, or invite the person first. |
| `403` | `This integration may not delete people. An admin can allow it in Settings → Integrations.` | `DELETE /users` without **Can delete people**. | Ask an admin to turn it on for the app. |
| `403` | `This person did not come through this integration; an admin can delete them from Members` | `DELETE /users` for someone the app didn't create, link or issue a login link for. | An admin deletes them from **Members**. |
| `404` | `Ticket not found for this person` | `ticketId` isn't the person's ticket, and isn't public. | Send one of their tickets. |
| `409` | `This person is on the team; they must sign in directly` | The email, or the `externalId`, belongs to an admin, member or viewer. | Don't send team members through the integration. |
| `409` | `This person is invited to the team; they must accept the invitation themselves` | The email has a pending team invitation. | The person accepts the invitation. |
| `409` | `This person is on the team; an admin must remove them` | `DELETE /users` for an admin, member or viewer. | An admin deletes them from **Members**. |
| `409` | `An invitation for this email was just used` | An external invitation was used at the same moment. | Try again. |

## Browser link errors

Login links and signed launch links never show an error page. When something is wrong, Ticketer redirects to the
sign-in page with an `error` parameter and shows an explanation, such as `/auth/login?error=launch_expired`.

| Code | Shown as | Cause |
| --- | --- | --- |
| `launch_invalid` | This link is not valid | Unknown app ID, unknown login link, a repeated or invalid parameter, a missing `ts`, `nonce` or `sig`, `email` without `sig`, or a ticket the person can't see. |
| `launch_used` | This sign-in link was already used | The login link was opened before. |
| `launch_replayed` | This sign-in link was already used | The nonce of a signed link was used before. |
| `launch_expired` | This sign-in link has expired | The login link is older than 5 minutes, or the signed link's `ts` is older than 5 minutes or more than 1 minute in the future. |
| `launch_signature` | This link could not be verified | The signature doesn't match: wrong secret, a parameter changed after signing, or different encoding. Also when Ticketer can't decrypt the signing secret because `NUXT_APP_SECRET` changed; rotate the app's credentials. |
| `launch_disabled` | This integration is turned off | An admin turned the app off. |
| `launch_team` | You are on the team | The person is an admin, member or viewer, or has a pending team invitation. |
| `launch_no_account` | You need an account first | No account uses the email, and the app may not create accounts. |

### Debug a signature mismatch

1. Compare your implementation with the [worked example](/integrate/signed-links#check-your-implementation).
2. Make sure the URL's query is exactly the canonical string you signed, followed by `&sig=`.
3. Make sure every parameter, including `app`, `ts` and `nonce`, is part of the signed string.
4. Check that `~` isn't encoded and that `!`, `'`, `(`, `)`, `*` and spaces are (`%21`, `%27`, `%28`, `%29`, `%2A`,
   `%20`). A space must not become `+`.

The server log records each refused link with the tag `[integrations]` and the reason, for example
`signed launch refused { appId: '…', reason: 'signature', detail: 'The signature does not match' }`.

## What's next

- [Integration API reference](/reference/integration-api)
- [Troubleshooting](/reference/troubleshooting)
