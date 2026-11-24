# Create the first admin

Every Ticketer deployment needs at least one admin to invite people and change settings. This page shows the three
ways to create the first one.

| Method | Works on | When to use it |
| --- | --- | --- |
| First account | Cloudflare, Docker, Node | You can reach the site before anyone else does. |
| `NUXT_ADMIN_*` environment variables | Cloudflare, Docker, Node | You want the admin to exist from the first start. |
| `pnpm admin` command | Docker, Node | You need to create or promote an admin on a running deployment, or reset an admin's password. |

## Register the first account

While no registered account exists, anyone can create an account, even when sign-up is set to invitation only. The
first account becomes an admin. This also applies to the first person who signs in with single sign-on, unless a
group mapping or an invitation gives them another role.

1. Open your Ticketer site.
2. Select **Create an account**.
3. Enter an email, a username (3 to 30 letters, numbers or underscores) and a password of at least 8 characters.
4. Select **Create account**.

Guests who only opened a ticket or a chat don't count as accounts.

## Set the admin with environment variables

When `NUXT_ADMIN_EMAIL` and `NUXT_ADMIN_PASSWORD` are set, Ticketer creates that admin on the first request after it
starts, if no account uses that email yet. An existing account is never changed, so changing the variables later
doesn't reset a password.

| Variable | Rule |
| --- | --- |
| `NUXT_ADMIN_EMAIL` | A valid email address. |
| `NUXT_ADMIN_PASSWORD` | At least 8 characters. |
| `NUXT_ADMIN_NAME` | Username, 3 to 30 letters, numbers or underscores. Default: `admin`. |

If a value breaks a rule, or the username is already taken, no admin is created and the server log says why, for
example `Initial admin not created: NUXT_ADMIN_PASSWORD must be at least 8 characters`.

- **Cloudflare:** the Deploy button asks for these values. From the command line, run
  `pnpm exec wrangler secret put NUXT_ADMIN_EMAIL` and `pnpm exec wrangler secret put NUXT_ADMIN_PASSWORD`.
- **Docker:** export `NUXT_ADMIN_EMAIL` and `NUXT_ADMIN_PASSWORD` before `docker compose up`. The compose file passes
  the password as a Compose secret.

After you sign in, change the password: open the user menu, select **Account**, and fill in **Current password**,
**New password** and **Confirm new password** under **Password**. Changing it also invalidates any password reset
links sent earlier.

## Use the command-line tool

On Docker and Node deployments, `scripts/admin.mjs` writes directly to the SQLite database. It creates an admin, or
promotes an existing account to admin. It doesn't work on Cloudflare, because D1 isn't a local file.

**Docker:**

```bash
docker compose -f docker-compose.prod.yml exec ticketer node scripts/admin.mjs --email you@example.com
```

**Node (from the app directory):**

```bash
pnpm admin --email you@example.com
```

When the account is new, the tool asks for a password. For an existing account, it only changes the password when you
pass `--password` or `--reset-password`. For all options, see [Command-line tool](/reference/cli).

## What's next

- [Invite people and manage roles](/admin/invite-people)
- [Set up email](/admin/email)
- [Command-line tool](/reference/cli)
