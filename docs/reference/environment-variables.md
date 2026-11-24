# Environment variables

This page lists every environment variable Ticketer reads, grouped by purpose. "Applies to" says whether a variable
works on Node (including Docker), on Cloudflare, or both.

On Cloudflare, set runtime variables as Worker secrets (`wrangler secret put <NAME>`) or variables. On Docker, export
them before `docker compose up`; see [Run with Docker](/guide/docker). Where a value can also be set in **Settings**,
the environment variable wins and the field is locked there.

## Required

| Variable | Default | Description | Applies to |
| --- | --- | --- | --- |
| `NUXT_APP_SECRET` | None. Development generates one. | Seals sign-in cookies and derives the key that encrypts secrets saved in Settings. At least 32 characters; generate with `openssl rand -base64 32`. | Both |

::: warning
Changing `NUXT_APP_SECRET` signs everyone out and makes saved secrets unreadable: the SMTP password, the single sign-on
client secret and integration signing secrets. Re-enter them and rotate integration credentials after a change.
Ticketer replaces its Web Push key by itself, and each browser subscribes again the next time its person opens
Ticketer; see
[Push notifications stopped working for everyone](/reference/troubleshooting#push-notifications-stopped-working-for-everyone).
:::

## First admin

See [Create the first admin](/admin/first-admin).

| Variable | Default | Description | Applies to |
| --- | --- | --- | --- |
| `NUXT_ADMIN_EMAIL` | None | Email of an admin created on the first request, if no account uses it. | Both |
| `NUXT_ADMIN_PASSWORD` | None | That admin's password. At least 8 characters. | Both |
| `NUXT_ADMIN_NAME` | `admin` | That admin's username: 3 to 30 letters, numbers or underscores. | Both |

## Email

See [Set up email](/admin/email).

| Variable | Default | Description | Applies to |
| --- | --- | --- | --- |
| `NUXT_MAIL_FROM` | None | Sender address, such as `Ticketer <support@example.com>`. Overrides **From address** in Settings. | Both |
| `NUXT_MAIL_SMTP_URL` | None | SMTP connection URL, such as `smtps://user:password@smtp.example.com:465`. Overrides the **SMTP server** settings. | Node |

On Cloudflare, mail uses the `EMAIL` binding instead of SMTP; see [Cloudflare build](#cloudflare-build).

## Single sign-on

Each variable pins one field in **Settings** > **Sign-in**. See [Set up single sign-on](/admin/single-sign-on).

| Variable | Default | Description | Applies to |
| --- | --- | --- | --- |
| `NUXT_OIDC_ENABLED` | `true` when `NUXT_OIDC_ISSUER` and `NUXT_OIDC_CLIENT_ID` are set; otherwise the Settings switch | Turns single sign-on on or off. Accepts `true`, `false`, `1`, `0`, `yes`, `no`, `on`, `off`. | Both |
| `NUXT_OIDC_ISSUER` | None | Issuer URL. Must be `https://`, except for `localhost`. | Both |
| `NUXT_OIDC_CLIENT_ID` | None | Client ID. | Both |
| `NUXT_OIDC_CLIENT_SECRET` | None | Client secret. Leave empty for a public client. | Both |
| `NUXT_OIDC_NAME` | `Single sign-on` | Button label: "Continue with …". | Both |
| `NUXT_OIDC_SCOPES` | `openid email profile` | Scopes, separated by spaces or commas. `openid` is always added. | Both |
| `NUXT_OIDC_DEFAULT_ROLE` | `external` | Role for new people: `external`, `viewer`, `member`, or `none` (only invited or group-mapped people). | Both |
| `NUXT_OIDC_GROUPS_CLAIM` | `groups` | Claim that lists groups. Dotted paths work, such as `realm_access.roles`. | Both |
| `NUXT_OIDC_ROLE_GROUPS` | None | Group-to-role mapping: `role:group` pairs separated by commas, such as `admin:ticketer-admins,member:staff`. | Both |
| `NUXT_OIDC_ONLY` | `false` | `true` hides password sign-in (except for admins), sign-up and reset. | Both |
| `NUXT_OIDC_REDIRECT_URL` | `<origin>/auth/oidc/callback` | Full callback URL. Set it only when a proxy hides the public address. | Both |

## Appearance

| Variable | Default | Description | Applies to |
| --- | --- | --- | --- |
| `NUXT_PUBLIC_APP_NAME` | The **Name** in Settings → Branding, else `Ticketer` | Name shown in the app, on the public pages, in page titles, push notifications and emails. Overrides **Name** in Settings. See [Brand your site](/admin/branding). | Both |

## Site address

| Variable | Default | Description | Applies to |
| --- | --- | --- | --- |
| `NUXT_SITE_URL` | The address the team last opened Ticketer at | Public address, such as `https://tickets.example.com`. Used for links in emails sent on a schedule, such as due-date reminders, and for the logo in emails. | Both |

## Bot protection

See [Protect forms from bots](/admin/bot-protection). Each variable overrides its field in Settings.

| Variable | Default | Description | Applies to |
| --- | --- | --- | --- |
| `NUXT_CAPTCHA_PROVIDER` | Settings, else off | `turnstile`, `recaptcha` (v2 checkbox) or `none`. | Both |
| `NUXT_CAPTCHA_SITE_KEY` | None | The provider's site key. Public. | Both |
| `NUXT_CAPTCHA_SECRET_KEY` | None | The provider's secret key. On Cloudflare, add it as a secret. | Both |

## GitHub

See [Sync projects with GitHub issues](/admin/github). Each variable overrides the GitHub App stored in Settings.

| Variable | Default | Description | Applies to |
| --- | --- | --- | --- |
| `NUXT_GITHUB_APP_ID` | Settings | The GitHub App's ID. | Both |
| `NUXT_GITHUB_APP_SLUG` | Settings | The app's URL name, from `github.com/apps/<slug>`. | Both |
| `NUXT_GITHUB_PRIVATE_KEY` | Settings | The app's private key (PEM). `\n` sequences are turned into line breaks. | Both |
| `NUXT_GITHUB_WEBHOOK_SECRET` | Settings | The app's webhook secret. | Both |
| `NUXT_GITHUB_API_URL` | `https://api.github.com` | API address, for GitHub Enterprise Server. | Both |
| `NUXT_GITHUB_WEB_URL` | `https://github.com` | Web address, for GitHub Enterprise Server. | Both |

## Node server

| Variable | Default | Description | Applies to |
| --- | --- | --- | --- |
| `LIBSQL_URL` | `file:.data/db/sqlite.db` (Docker image: `file:/app/.data/db/sqlite.db`) | SQLite database. The directory is created if needed. | Node |
| `PORT` | `3000` | Port to listen on. | Node |
| `HOST` | All interfaces (the Docker image sets `0.0.0.0`) | Interface to listen on. | Node |

If `LIBSQL_URL` is unset, a `DATABASE_URL` with a `file:`, `libsql:`, `http(s):` or `ws(s):` URL is used instead. A
`DATABASE_URL` with any other scheme, such as `postgres://`, is ignored with a warning.

## Docker Compose

Read by `docker-compose.prod.yml` (and, for `TICKETER_PORT`, `docker-compose.yml`), not by the app.

| Variable | Default | Description |
| --- | --- | --- |
| `TICKETER_IMAGE` | `ghcr.io/primaldjinn/ticketer:latest` | Image to run, such as a `:sha-<commit>` tag or a fork's image. |
| `TICKETER_BIND` | `127.0.0.1` | Host interface the port is published on. |
| `TICKETER_PORT` | `3000` | Host port. |
| `CLOUDFLARE_TUNNEL_TOKEN` | None | Tunnel token. Required with `--profile tunnel`. |

## Cloudflare build

Read by `pnpm build:cloudflare` (and by `pnpm build` in Cloudflare Workers Builds) when it writes
`.output/server/wrangler.json`. Set them in the shell or CI that runs the build, not on the Worker.

| Variable | Default | Description |
| --- | --- | --- |
| `CF_WORKER_NAME` | `ticketer` | Worker name. |
| `CF_D1_DATABASE_ID` | None: the first deploy creates a database | ID of an existing D1 database. |
| `CF_D1_DATABASE_NAME` | `ticketer` | D1 database name. |
| `CF_R2_BUCKET` | None: the first deploy creates a bucket | Name of an existing R2 bucket. |
| `CF_CUSTOM_DOMAIN` | None | Hostname to serve the Worker on. Its zone must be on the same account. |
| `CF_SEND_EMAIL` | None | `true` adds the `EMAIL` send_email binding for Cloudflare Email Sending. |
| `NITRO_PRESET` | `node-server`, or `cloudflare-durable` in Workers Builds | Build target. The `build:node` and `build:cloudflare` scripts set it. |

## GitHub Actions

The deploy job in `.github/workflows/ci.yml` reads repository secrets and variables. See
[Deploy from GitHub Actions](/guide/deploy-cloudflare#deploy-from-github-actions).

| Name | Kind | Description |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret | API token with Workers, D1 and R2 edit permissions. |
| `CLOUDFLARE_ACCOUNT_ID` | Variable | Cloudflare account ID. |
| `CF_D1_DATABASE_ID` | Variable | D1 database ID. Required for the deploy job. |
| `NUXT_APP_SECRET` | Secret | Uploaded as a Worker secret. |
| `NUXT_ADMIN_PASSWORD` | Secret | Optional. Uploaded as a Worker secret. |
| `NUXT_ADMIN_EMAIL`, `NUXT_MAIL_FROM` | Variable | Optional. Set as Worker variables. |
| `CF_R2_BUCKET`, `CF_WORKER_NAME`, `CF_CUSTOM_DOMAIN`, `CF_SEND_EMAIL` | Variable | Optional. Passed to the build. |

## What's next

- [Deploy to Cloudflare](/guide/deploy-cloudflare)
- [Run with Docker](/guide/docker)
- [Troubleshooting](/reference/troubleshooting)
