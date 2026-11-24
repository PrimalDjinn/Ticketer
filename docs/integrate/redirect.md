# Redirect with an API key

This page shows you how to get a login link as a redirect instead of JSON, for backends that can only proxy a
redirect. It does the same as [Create a login link](/integrate/login-link), but takes query parameters and answers
`302 Found` with the login link in the `Location` header.

## Before you begin

- An app in **Settings** > **Integrations**, and its API key. See [Connect an app](/admin/integrations).
- The API key on your server. Send it in a header, never in the URL.

## Send the request

Your backend calls `GET /api/integrations/v1/sessions` with the key in `Authorization: Bearer <key>` or
`X-Api-Key: <key>`, then passes the `302` on to the browser.

```bash
curl -i "https://tickets.example.com/api/integrations/v1/sessions?email=jane%40example.com&name=Jane&external_id=user_123&title=Export%20fails&context%5Burl%5D=https%3A%2F%2Fapp.example.com%2Freports" \
  -H "X-Api-Key: $TICKETER_API_KEY"
```

```http
HTTP/1.1 302 Found
cache-control: no-store
location: https://tickets.example.com/launch/3f9c…
```

The login link works once, within 5 minutes.

## Query parameters

Parameter names are snake_case. Percent-encode every value.

| Parameter | Same as body field | Required |
| --- | --- | --- |
| `email` | `email` | Yes |
| `name` | `name` | No |
| `external_id` | `externalId` | No |
| `target` | `target` | No |
| `ticket_id` | `ticketId` | With `target=ticket` |
| `title` | `ticket.title` | To open a ticket |
| `description` | `ticket.description` | No |
| `urgency` | `ticket.urgency` | No |
| `context[<key>]` | `ticket.context.<key>` | No. Repeat with different keys, such as `context[url]` and `context[plan]`. |
| `return_url` | `returnUrl` | No |

The limits are the same as for the [JSON body](/integrate/login-link#body-fields). A ticket is opened only when
`title` is present. Each parameter may appear only once; a repeated parameter fails with `400`.

## Errors

Errors come back as JSON with the status code, not as a redirect. See [Errors](/integrate/errors).

## What's next

- [Signed launch links](/integrate/signed-links)
- [Errors](/integrate/errors)
- [Integration API reference](/reference/integration-api)
