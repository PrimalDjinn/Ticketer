# Troubleshooting

This page lists problems you might run into when you deploy or run Ticketer, with the messages you see and how to fix
them.

Most fixes start in the server log. On Docker, run `docker compose -f docker-compose.prod.yml logs ticketer`. On
Cloudflare, open the Worker's logs in the dashboard, or run `pnpm exec wrangler tail`. Log lines start with a tag such
as `[mail]`, `[oidc]`, `[integrations]`, `[migrations]` or `[bootstrap]`.

## The app doesn't start or answers 500

### `NUXT_APP_SECRET` is missing or too short

**Docker:** the container exits with:

```text
Missing required setting: NUXT_APP_SECRET (generate one with: openssl rand -base64 32)
```

**Node or Cloudflare:** requests fail with `500` and the message:

```text
`appSecret` is not set. Set `NUXT_APP_SECRET` to at least 32 characters, or pass a secret explicitly.
```

Set `NUXT_APP_SECRET` to at least 32 characters, for example the output of `openssl rand -base64 32`. On Cloudflare,
run `pnpm exec wrangler secret put NUXT_APP_SECRET`.

If the message says `appSecret` was set to a number, an array or another non-string type, the value looked like JSON.
Generate a new value with `openssl rand -base64 32`.

### The database isn't reachable

`GET /healthz` returns `{"ok":true}` when the database answers, and `503` with the error otherwise. The Docker health
check uses it.

## Everyone was signed out, or saved secrets stopped working

`NUXT_APP_SECRET` changed. Sessions are sealed with it, and secrets saved in Settings are encrypted with a key derived
from it. The log shows:

```text
[secrets] a stored secret could not be decrypted; was NUXT_APP_SECRET changed? Re-enter it in Settings.
```

Either restore the previous value, or:

1. In **Settings** > **Sign-in**, enter the client secret again. Until then, the page shows
   `The stored client secret cannot be read (was NUXT_APP_SECRET changed?). Enter it again.`
2. In **Settings** > **Email**, enter the SMTP password again.
3. In **Settings** > **Integrations**, rotate every app's credentials and update the apps. Their signed links fail
   with `launch_signature` until you do.
4. Reset the Web Push key. See
   [Push notifications stopped working for everyone](#push-notifications-stopped-working-for-everyone).

## Email isn't sent

Until email is set up, Ticketer logs each message instead of sending it, including the full text with the link:

```text
[mail] no sender address configured; not sending { to: '…', subject: 'Reset your Ticketer password', text: '…' }
[mail] no mail transport configured; not sending { … }
```

Copy the link from `text` to help someone right away, then fix the setup:

| Log message | Cause | Fix |
| --- | --- | --- |
| `no sender address configured` | No **From address** and no `NUXT_MAIL_FROM`. | Set one in **Settings** > **Email**. |
| `no mail transport configured` on Node | No SMTP server in Settings and no `NUXT_MAIL_SMTP_URL`. | [Set up SMTP](/admin/email#set-up-smtp-on-node-or-docker). |
| `no mail transport configured` on Cloudflare | The Worker has no `EMAIL` binding. | Build with `CF_SEND_EMAIL=true` or add the binding to `wrangler.jsonc`, then deploy. |
| `sending failed` | The SMTP server or Cloudflare refused the message. The log includes the reason. | Check credentials, port and security, or that the sender's domain is onboarded to Email Sending. |

Use **Send test** in **Settings** > **Email** to see the error directly. Invitation links are also shown to the admin
on screen, so you can send them by hand.

## Links point to the wrong address

Ticketer builds the links it sends (invitations, password resets, integration login links) and the single sign-on
callback URL from the request's `Host` header and the `X-Forwarded-Proto` header. Behind a reverse proxy, make the
proxy pass the original `Host` header and set `X-Forwarded-Proto`. If the proxy changes the host, set
`NUXT_OIDC_REDIRECT_URL` to the public callback URL for single sign-on.

## Push notifications stopped working for everyone

Ticketer creates its Web Push key pair the first time someone turns push on, and stores the private key encrypted with
a key derived from `NUXT_APP_SECRET`. If that secret changes, every push fails and turning push on fails too. The log
shows:

```text
[push] push failed { host: '…', error: 'The Web Push key could not be decrypted (was NUXT_APP_SECRET changed?)' }
```

Restore the previous `NUXT_APP_SECRET`, or create a new key pair:

1. Delete the stored key from the database:

   ```sql
   DELETE FROM settings WHERE key = 'vapid';
   ```

   On Docker and Node, run it with `sqlite3` against the database file. On Cloudflare, run
   `pnpm exec wrangler d1 execute <database-name> --remote --command "DELETE FROM settings WHERE key = 'vapid'"`,
   where `<database-name>` is your D1 database's name (default `ticketer`). Ticketer creates a new key pair on next use.
2. Ask everyone to turn **Push notifications on this device** off and on again on their **Account** page, in each
   browser. Their old subscriptions belong to the old key.

For one person whose push notifications don't arrive, see
[Get notifications](/use/notifications#push-notifications-don-t-arrive).

## Single sign-on errors

When single sign-on fails, the person lands on the sign-in page with `?error=oidc_<code>`. The log has the details,
for example `[oidc] single sign-on refused (unverified_email): …` or `[oidc] single sign-on failed …`.

| Code | Shown as | Cause | Fix |
| --- | --- | --- | --- |
| `oidc_disabled` | Single sign-on is not set up | Single sign-on is off or incomplete. | Check **Settings** > **Sign-in** for a problem message. |
| `oidc_state` | That sign-in took too long | The sign-in took more than 10 minutes, was started in another browser, the browser dropped the sign-in cookie, or the issuer changed during sign-in. | Try again in one browser. Make sure the callback URL uses the same host the person started on. |
| `oidc_denied` | Sign-in was cancelled | The provider returned an error, for example the person declined consent or isn't allowed to use the application. | Check the application's access policy at the provider. The log includes the provider's error. |
| `oidc_failed` | Single sign-on failed | Discovery, the token exchange or ID token validation failed. | See the next table. |
| `oidc_unverified_email` | Your email is not verified | An account with that email exists, but the provider didn't send `email_verified: true`. | Make the provider send a verified email, or have the person sign in with their password. |
| `oidc_no_email` | No email address was shared | The provider sent no email address. | Add the `email` scope, and make sure the user has an email at the provider. |
| `oidc_no_access` | You do not have access yet | **Role for new people** is **Nobody**, and the person has no invitation and no mapped group. | Invite them, or add them to a mapped group. |
| `oidc_invite_used` | Your invitation was already used | Two sign-ins used the same invitation at once. | Sign in again. |

Common log messages behind `oidc_failed`:

| Log message | Fix |
| --- | --- |
| `The provider calls itself "…", which does not match the configured issuer "…"` | Use the issuer exactly as the provider's discovery document states it. |
| `Could not reach …/.well-known/openid-configuration` or `… answered 404` | Check the issuer URL. Use **Test connection**. |
| `The token endpoint answered 400: invalid_grant` or `invalid_client` | Check the client ID and secret, and that the redirect URI at the provider is exactly the **Callback URL**. |
| `No key in the provider's key set matches the ID token` | The ID token's key isn't in the provider's published key set. Check the provider's signing key settings. |
| `Unsupported ID token algorithm …` | Choose a signing algorithm Ticketer supports, such as RS256 or ES256. See [Set up single sign-on](/admin/single-sign-on). |
| `The ID token uses HS256 but no client secret is configured` | Enter the client secret, or configure an asymmetric signing key at the provider. |
| `The ID token has expired` or `was issued in the future` | Fix the server clock. Ticketer allows 60 seconds of skew. |
| `The ID token is meant for another client` | The client ID in Ticketer doesn't match the application at the provider. |

If the provider shows its own error page about the redirect URI, register the **Callback URL** from **Settings** >
**Sign-in** exactly, including the scheme and any trailing path.

## Integration links fail

The person lands on `/auth/login?error=launch_<reason>`, and the log has a line tagged `[integrations]` with the
reason. See [Errors](/integrate/errors#browser-link-errors).

## The first admin wasn't created

The log explains why `NUXT_ADMIN_EMAIL` was ignored:

| Log message | Fix |
| --- | --- |
| `Initial admin not created: NUXT_ADMIN_PASSWORD must be at least 8 characters` | Use a longer password. |
| `Initial admin not created: …` naming another rule | Fix that value. Both `NUXT_ADMIN_EMAIL` and `NUXT_ADMIN_PASSWORD` must be set. |
| `Initial admin not created: the username "admin" is taken; set NUXT_ADMIN_NAME` | Set `NUXT_ADMIN_NAME` to a free username. |

If an account with that email already exists, nothing happens and nothing is logged. On Docker and Node, use
[`pnpm admin`](/reference/cli) to promote it.

## Database and migrations

Migrations run before the first request is served, on Node, Docker and Cloudflare alike. The log shows `[migrations] ✔ applied <name>` for each one. If a migration fails, the log
shows `[migrations] failed` and requests wait or fail; the next request tries again.

### On Cloudflare

- `[nuxt-hub] DB binding not found`: the Worker has no `DB` binding. Build with `pnpm build:cloudflare` and deploy
  with the generated config, which `wrangler deploy` picks up from `.output/server/wrangler.json`.
- To apply migrations yourself, run `pnpm cf:migrate` after `pnpm build:cloudflare`. It runs
  `wrangler d1 migrations apply DB --remote` with the generated config. The Worker and Wrangler record applied
  migrations in the same `_hub_migrations` table, so you can use both.

### On Node: `URL_SCHEME_NOT_SUPPORTED`

The SQLite driver can't open the database URL. Ticketer reads `LIBSQL_URL` first, then `DATABASE_URL`. A `DATABASE_URL`
left over from another project, such as `postgres://…`, is ignored with this warning:

```text
DATABASE_URL uses "postgres:", which SQLite cannot open; using file:.data/db/sqlite.db. Set LIBSQL_URL to choose the database file.
```

If you still see the error, `LIBSQL_URL` itself has an unsupported scheme. Set it to a `file:` URL, such as
`LIBSQL_URL=file:.data/db/sqlite.db`.

## `pnpm admin` fails

| Message | Fix |
| --- | --- |
| `Cannot find @adonisjs/hash; run this from the app directory …` | Run it from the app directory. In a source checkout, run `pnpm build:node` first. |
| `No users table in <url>` | Start the app once so it applies migrations, or check `LIBSQL_URL`. |
| `Pass --password when not running interactively` | Pass `--password`, or run in a terminal. |
| `Use at least 8 characters for the password` | Use a longer password. |

## What's next

- [Environment variables](/reference/environment-variables)
- [Set up email](/admin/email)
- [Set up single sign-on](/admin/single-sign-on)
