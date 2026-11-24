# Local development

This page shows you how to run Ticketer from source on your machine, change the database schema, and build both
deployment targets.

## Before you begin

- Node.js 22 or later.
- pnpm. The repository pins its version in `package.json` (`packageManager`), so `corepack enable` sets it up.

## Run the development server

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/PrimalDjinn/Ticketer.git
   cd Ticketer
   pnpm install
   ```

2. Optional: copy the example environment file and fill in what you need:

   ```bash
   cp .env.example .env
   ```

   In development you can leave `NUXT_APP_SECRET` empty. Nuxt then generates a development secret and prints a
   warning. Builds never generate one.

3. Start the server:

   ```bash
   pnpm dev
   ```

4. Open `http://localhost:3000` and select **Create an account**. The first account becomes the admin.

Development data, including the SQLite database at `.data/db/sqlite.db` and uploaded files, lives in `.data/`. Set
`LIBSQL_URL` to use another database file, for example `LIBSQL_URL=file:/tmp/ticketer.db pnpm dev`.

## Change the database schema

1. Edit `server/db/schema.ts`.
2. Generate a migration:

   ```bash
   pnpm db:generate
   ```

   The migration is written to `server/db/migrations/sqlite`.

Migrations apply automatically: when the development server starts, and in production before the server, container
or Worker answers its first request.

## Build

| Command | Output |
| --- | --- |
| `pnpm build:node` | Node server in `.output/` (start it with `pnpm start`) |
| `pnpm build:cloudflare` | Cloudflare Worker in `.output/`, with `.output/server/wrangler.json` |
| `pnpm build` | Cloudflare when it runs in Cloudflare Workers Builds, otherwise Node. Set `NITRO_PRESET` to choose. |

Both builds write to `.output/`, so the second build replaces the first.

## Check types

```bash
pnpm typecheck
```

CI runs the type check and both builds on every push and pull request.

## Work on these docs

The documentation site uses VitePress and lives in `docs/`:

```bash
pnpm docs:dev     # preview with live reload
pnpm docs:build   # build to docs/.vitepress/dist
```

## What's next

- [Run with Docker](/guide/docker)
- [Command-line tool](/reference/cli)
- [Environment variables](/reference/environment-variables)
