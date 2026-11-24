# Run with Docker

This page shows you how to run Ticketer on your own server with Docker Compose, using the published image. It also
covers the optional Cloudflare Tunnel and running the Node build without Docker.

The image runs the Node build of Ticketer. The SQLite database and uploaded files live on one volume, so you can
replace containers freely.

## Before you begin

- A server with Docker and the Docker Compose plugin.
- The file `docker-compose.prod.yml` from the [repository](https://github.com/PrimalDjinn/Ticketer).
- Optional: an SMTP server for invitation and password reset mail.

## Start Ticketer

1. Generate the app secret and export it:

   ```bash
   export NUXT_APP_SECRET=$(openssl rand -base64 32)
   ```

   Save the value. You need the same value every time you start the stack.

   ::: warning
   Changing `NUXT_APP_SECRET` signs everyone out and makes secrets saved in Settings unreadable: the SMTP password,
   the single sign-on client secret and every integration's signing secret. Push notifications pause for each person
   until they next open Ticketer.
   :::

2. Optional: set the first admin and mail. Without an admin, the first person to register becomes the admin.

   ```bash
   export NUXT_ADMIN_EMAIL=you@example.com
   export NUXT_ADMIN_PASSWORD='<password>'
   export NUXT_MAIL_FROM='Ticketer <support@example.com>'
   export NUXT_MAIL_SMTP_URL='smtps://<user>:<password>@smtp.example.com:465'
   ```

   Replace the values in angle brackets. The admin password needs at least 8 characters. You can also configure mail
   later in **Settings** > **Email**.

3. Start the stack:

   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

4. Open `http://127.0.0.1:3000` on the server.

The container refuses to start without `NUXT_APP_SECRET` and prints `Missing required setting: NUXT_APP_SECRET`.
Database migrations run before the server answers its first request.

## How the compose file is set up

| Setting | Value |
| --- | --- |
| Image | `${TICKETER_IMAGE:-ghcr.io/primaldjinn/ticketer:latest}`, pulled on every `up` |
| Port | `${TICKETER_BIND:-127.0.0.1}:${TICKETER_PORT:-3000}` on the host, `3000` in the container |
| Volume | `ticketer_data` at `/app/.data` |
| Secrets | `NUXT_APP_SECRET`, `NUXT_MAIL_SMTP_URL` and `NUXT_ADMIN_PASSWORD` are passed as Compose secrets |
| Environment | `NUXT_MAIL_FROM`, `NUXT_ADMIN_EMAIL` |
| Health check | `GET /healthz`, which also checks the database |
| Logs | `json-file`, 5 files of 10 MB |

By default the port listens on `127.0.0.1` only. Put a reverse proxy in front of it, use the tunnel described below,
or set `TICKETER_BIND=0.0.0.0` to listen on all interfaces.

## Back up your data

The `ticketer_data` volume holds everything Ticketer writes:

| Path in the container | Contents |
| --- | --- |
| `/app/.data/db/sqlite.db` | SQLite database |
| `/app/.data/blob/` | Uploaded files |

Back up the whole volume. Compose prefixes the volume name with the project name, for example
`ticketer_ticketer_data`; run `docker volume ls` to find it.

## Choose an image tag

CI publishes the image to GitHub Container Registry:

| Tag | Points to |
| --- | --- |
| `latest` | The latest build of `main` |
| `sha-<short commit>` | One specific commit |

To pin a version or run a fork's image, set `TICKETER_IMAGE`:

```bash
export TICKETER_IMAGE=ghcr.io/primaldjinn/ticketer:sha-<short-commit>
docker compose -f docker-compose.prod.yml up -d
```

## Publish through Cloudflare Tunnel

The `tunnel` profile adds a `cloudflared` container, so you don't need to open inbound ports.

1. In the Cloudflare dashboard, create a tunnel and copy its token.
2. Add a public hostname to the tunnel that points to `http://ticketer:3000`.
3. Start the stack with the profile:

   ```bash
   export CLOUDFLARE_TUNNEL_TOKEN=<token>
   docker compose -f docker-compose.prod.yml --profile tunnel up -d
   ```

`cloudflared` waits until Ticketer is healthy. WebSockets work through the tunnel.

## Build the image yourself

`docker-compose.yml` builds the image from your checkout instead of pulling it, and publishes port 3000 on all
interfaces:

```bash
export NUXT_APP_SECRET=$(openssl rand -base64 32)
docker compose up --build
```

## Run without Docker

1. Build the Node server:

   ```bash
   pnpm install
   pnpm build:node
   ```

2. Start it:

   ```bash
   LIBSQL_URL=file:.data/db/sqlite.db NUXT_APP_SECRET='<secret>' node .output/server/index.mjs
   ```

   `PORT` and `HOST` set where the server listens. Data goes to `.data/` in the working directory.

## What's next

- [Create the first admin](/admin/first-admin)
- [Set up email](/admin/email)
- [Environment variables](/reference/environment-variables)
