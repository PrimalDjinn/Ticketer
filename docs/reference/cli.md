# Command-line tool

`scripts/admin.mjs` creates an admin or promotes an existing account to admin, directly in the SQLite database of a
Node or Docker deployment. Use it to set up the first admin, to recover access when no admin can sign in, or to reset
an admin's password.

It doesn't work on Cloudflare, because D1 isn't a local file. On Cloudflare, use the `NUXT_ADMIN_EMAIL` and
`NUXT_ADMIN_PASSWORD` secrets; see [Create the first admin](/admin/first-admin).

## Synopsis

```bash
pnpm admin --email <email> [--password <password>] [--name <username>] [--reset-password]
```

In Docker:

```bash
docker compose -f docker-compose.prod.yml exec ticketer node scripts/admin.mjs --email <email>
```

## Options

| Option | Description |
| --- | --- |
| `--email <email>` | Required. The account to create or promote. |
| `--password <password>` | Password, at least 8 characters. For a new account, you're prompted if you leave it out. For an existing account, the password changes only when you pass this option or `--reset-password`. |
| `--name <username>` | Username for a new account. Default: the part of the email before `@`. Characters other than letters, digits and underscores are removed. If the name is taken, a random suffix is added. |
| `--reset-password` | For an existing account: prompt for a new password. |
| `-h`, `--help` | Print usage. |

The prompt needs an interactive terminal. In scripts, pass `--password`. With `docker compose exec`, the terminal is
interactive by default.

## What it does

| Situation | Result |
| --- | --- |
| No account has the email | Creates an admin with that email and password. |
| An account has the email | Makes it an admin. Changes the password only with `--password` or `--reset-password`. |

It prints, for example, `✔ Created admin you@example.com (username you).` or
`✔ you@example.com (you) is now an admin.`

## Database location

The tool opens `LIBSQL_URL`, or `file:.data/db/sqlite.db` relative to the current directory if it's unset. In the
Docker image, `LIBSQL_URL` is already `file:/app/.data/db/sqlite.db`.

The tool doesn't apply migrations. If the database is new, start the app once first; otherwise the tool stops with
`No users table in <url>. Start the app once so it can apply its migrations, then retry.`

## Run it from a source checkout

Run the tool from the app directory. It loads `@libsql/client` and `@adonisjs/hash` from
`.output/server/node_modules` (a Node build) or from `node_modules`. With pnpm, `@adonisjs/hash` is only reachable
after a Node build, so run `pnpm build:node` first if the tool reports `Cannot find @adonisjs/hash`.

## Examples

Create the first admin and be prompted for a password:

```bash
pnpm admin --email you@example.com
```

Reset an admin's password in Docker:

```bash
docker compose -f docker-compose.prod.yml exec ticketer node scripts/admin.mjs --email you@example.com --reset-password
```

Promote an existing account without changing its password:

```bash
pnpm admin --email colleague@example.com
```

## What's next

- [Create the first admin](/admin/first-admin)
- [Troubleshooting](/reference/troubleshooting)
