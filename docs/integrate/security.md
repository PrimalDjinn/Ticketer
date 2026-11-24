# Security model

This page describes how Ticketer limits what a connected app can do, so you can judge the risk of an integration and
know what to do if a credential leaks.

## Apps can't sign in the team

Integration credentials only ever sign in or create **external** accounts:

- If the email belongs to an admin, member or viewer, every flow refuses with `409` ("This person is on the team; they
  must sign in directly").
- If the email has a pending invitation to the team, Ticketer refuses too. The person must accept the invitation
  themselves.
- If someone is promoted to the team after a login link was issued, the link no longer works.
- Accounts created by an app are always external.

A leaked API key or signing secret lets someone sign in as any of your external accounts, create external accounts if
the app may, and, with the API key, list external people's tickets. If the app has **Can delete people** on, a leaked
API key can also delete the external people who came through that app. It never yields a team session. Turn the app
off or rotate its credentials as soon as you suspect a leak.

## Deleting people is opt-in and limited

`DELETE /api/integrations/v1/users` works only when an admin has turned on **Can delete people** for the app; it's off
by default. Even then, the app can delete only external people who came through it: people it created, people it
linked by external ID, and people it issued a login link for. Ticketer keeps login link records for about a day after
they expire. Team members return `409`, and anyone else returns `403`. Every
deletion is recorded in the `account_deletions` table with the app's ID. See
[Delete accounts and personal data](/admin/delete-accounts#audit-record).

## Credentials

| Credential | Where it lives | How Ticketer stores it |
| --- | --- | --- |
| API key (`tkt_…`) | Your server only | SHA-256 hash |
| Signing secret (`tks_…`) | Your server only | Encrypted with AES-GCM under a key derived from `NUXT_APP_SECRET` |
| App ID (`app_…`) | Can be public | Plain |

Ticketer compares keys and signatures in constant time. Both credentials are shown once, when the app is created or
rotated.

## Links are short-lived and single-use

| Link | Valid for | Reuse |
| --- | --- | --- |
| Login link (`/launch/<token>`) | 5 minutes after it's issued | Works once |
| Signed launch link (`/launch?…&sig=…`) | 5 minutes after `ts`, and up to 1 minute before it for clock skew | Each nonce works once per app |

Ticketer checks a signed link's signature before its nonce, so someone without the secret can't use up your nonces.
Responses to launch links aren't cached and send no referrer, so the token doesn't leak to the next page.

## Redirects stay on Ticketer

People always land on a fixed path that Ticketer chooses: the report form, the support chat, their ticket list, or a
ticket they can see. A request can't redirect to an arbitrary URL.

The only outside address Ticketer shows is the **Back to** link, from `returnUrl` or `return_url`. It's used only when
its origin exactly matches one of the app's **Allowed return origins**; otherwise it's ignored.

## Turning an app off

- **Turn off** an app to stop its key, its signed links and any login links it issued that haven't been used yet.
- **Rotate** to replace the key and secret. The old ones stop working immediately.
- **Delete** to remove the app and its account links. People and tickets stay.

## Logging

Ticketer logs every use of an integration key, every refused request and every sign-in through an app, with the tag
`[integrations]`. Logs include the app ID, the path and the caller's IP address, never the key itself (only its first
12 characters for unknown keys).

## What's next

- [Connect an app](/admin/integrations)
- [Errors](/integrate/errors)
