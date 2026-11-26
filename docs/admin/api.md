# Control API access

This page shows admins how to allow or stop personal access tokens, which let people on the team use Ticketer's API
from scripts and other tools, and how to revoke tokens. For how to use the API, see [Use the API](/integrate/api).

## How tokens work

- Admins, members and viewers can create tokens under **Account** > **Access tokens**. People outside the team can't.
- A token acts as the person who made it, limited to the scopes chosen for it. It can never do more than that
  person's role allows, and a role change applies to their tokens at once.
- Ticketer stores only a hash of each token, and shows the token once, when it's created.

## Stop or allow tokens

1. Go to **Settings** > **API**.
2. Turn **Allow access tokens** off or on.

With it off, nobody can create a token, and every existing token stops working until you turn it on again. Tokens
aren't deleted.

## Revoke a token

**Settings** > **API** lists every token: its name, owner, scopes and when it was last used. Select **Revoke** next to
a token to stop it at once, for example when someone leaves or a token may have leaked. People can revoke their own
tokens under **Account**.

Deleting a person's account deletes their tokens too.

## Rate limit

Each token may make about 600 requests a minute. Change it with `NUXT_API_RATE_LIMIT`; see
[Environment variables](/reference/environment-variables#api-and-webhooks).

## What's next

- [Use the API](/integrate/api)
- [Send events to other tools](/admin/webhooks)
