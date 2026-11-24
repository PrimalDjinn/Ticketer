# Deploy to Cloudflare

This page shows you how to run Ticketer on Cloudflare Workers, either with the Deploy to Cloudflare button or from
your own machine with Wrangler. It also covers custom domains and email.

On Cloudflare, Ticketer uses these resources, declared in `wrangler.jsonc`:

| Binding | Resource | Used for |
| --- | --- | --- |
| `DB` | D1 database | All data |
| `BLOB` | R2 bucket | Uploaded files |
| `$DurableObject` | Durable Object | Holding realtime connections |
| `EMAIL` (optional) | `send_email` binding | Sending invitations and password resets |

The Worker applies database migrations itself on its first request, so a new, empty D1 database works.

## Before you begin

- A Cloudflare account.
- A GitHub account, if you use the Deploy button.
- A secret of at least 32 characters for `NUXT_APP_SECRET`. Generate one with:

  ```bash
  openssl rand -base64 32
  ```

  Store it somewhere safe. You need the same value for the life of the deployment.

::: warning
Changing `NUXT_APP_SECRET` signs everyone out and makes secrets saved in Settings unreadable: the SMTP password, the
single sign-on client secret and every integration's signing secret. You then have to enter them again and rotate the
integration credentials.
:::

## Deploy with the button

1. Open the [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/PrimalDjinn/Ticketer)
   link.
2. Sign in to Cloudflare and connect your GitHub account when asked. Cloudflare copies the repository to your GitHub
   account.
3. When asked for secrets, enter:
   - `NUXT_APP_SECRET`: the value you generated.
   - `NUXT_ADMIN_EMAIL` and `NUXT_ADMIN_PASSWORD` (optional): the first admin's email and a password of at least 8
     characters. If you leave them empty, the first person to register becomes the admin.
4. Start the deployment. Cloudflare creates the Worker, the D1 database, the R2 bucket and the Durable Object, then
   builds and deploys the app.
5. Open the Worker's URL. If you set `NUXT_ADMIN_EMAIL`, sign in with that account. Otherwise, select **Create an
   account**; the first account becomes the admin.

After this, every push to your copy of the repository redeploys the Worker.

## Deploy from your machine

Use this route if you want to control the build, reuse existing D1 or R2 resources, or deploy from CI.

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/PrimalDjinn/Ticketer.git
   cd Ticketer
   pnpm install
   ```

2. Sign in to Cloudflare:

   ```bash
   pnpm exec wrangler login
   ```

3. Optional: to use an existing D1 database or R2 bucket, set the database ID and the bucket name before you build. To
   create a database for this, run `pnpm exec wrangler d1 create ticketer` and copy the `database_id` it prints.

   ```bash
   export CF_D1_DATABASE_ID=<database-id>
   export CF_R2_BUCKET=<bucket-name>
   ```

   If you leave these unset, the first `wrangler deploy` creates a database and a bucket for you.

4. Build for Cloudflare:

   ```bash
   pnpm build:cloudflare
   ```

   The build writes `.output/server/wrangler.json`. `wrangler deploy` finds it automatically.

5. Deploy, then set the app secret:

   ```bash
   pnpm exec wrangler deploy
   pnpm exec wrangler secret put NUXT_APP_SECRET
   ```

6. Optional: set the first admin as secrets, then open the site. The admin is created on the first request.

   ```bash
   pnpm exec wrangler secret put NUXT_ADMIN_EMAIL
   pnpm exec wrangler secret put NUXT_ADMIN_PASSWORD
   ```

`pnpm cf:deploy` runs the build and `wrangler deploy` in one step.

### Build settings

`pnpm build:cloudflare` reads these variables and writes them into `.output/server/wrangler.json`:

| Variable | Effect |
| --- | --- |
| `CF_WORKER_NAME` | Worker name. Default: `ticketer`. |
| `CF_D1_DATABASE_ID` | Use this existing D1 database. |
| `CF_D1_DATABASE_NAME` | D1 database name. Default: `ticketer`. |
| `CF_R2_BUCKET` | Use this existing R2 bucket. |
| `CF_CUSTOM_DOMAIN` | Serve the Worker on this hostname. |
| `CF_SEND_EMAIL` | `true` adds the `EMAIL` send_email binding. |

## Use a custom domain

The domain's zone must be on the same Cloudflare account as the Worker.

1. Set the hostname and build:

   ```bash
   export CF_CUSTOM_DOMAIN=tickets.example.com
   pnpm build:cloudflare
   ```

   Replace `tickets.example.com` with your hostname.

2. Deploy:

   ```bash
   pnpm exec wrangler deploy
   ```

## Send email

Until email is set up, Ticketer writes invitation and password reset links to the Worker logs instead of sending them. To send
mail on Cloudflare, Ticketer uses the `EMAIL` send_email binding of Cloudflare Email Sending. SMTP isn't used on
Cloudflare.

1. Onboard your sending domain to Cloudflare Email Sending in the Cloudflare dashboard.
2. Add the binding. Do one of the following:
   - Build with `CF_SEND_EMAIL=true`.
   - In your copy of the repository, add `"send_email": [{ "name": "EMAIL" }]` to `wrangler.jsonc`.
3. Deploy again.
4. Set the sender address. Sign in as an admin, go to **Settings** > **Email**, enter a **From address** on your
   onboarded domain, such as `Ticketer <support@example.com>`, and select **Save**. You can set `NUXT_MAIL_FROM`
   instead.
5. Under **Send a test message**, enter your address and select **Send test**.

For details, see [Set up email](/admin/email).

## Deploy from GitHub Actions

The repository's `.github/workflows/ci.yml` deploys to Cloudflare from `main` when your repository has these settings.
Without them, the deploy job is skipped with a notice.

| Kind | Name | Required |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` (Workers, D1 and R2 edit permissions) | Yes |
| Secret | `NUXT_APP_SECRET` | Yes |
| Secret | `NUXT_ADMIN_PASSWORD` | No |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Yes |
| Variable | `CF_D1_DATABASE_ID` | Yes |
| Variable | `CF_R2_BUCKET`, `CF_WORKER_NAME`, `CF_CUSTOM_DOMAIN`, `CF_SEND_EMAIL` | No |
| Variable | `NUXT_MAIL_FROM`, `NUXT_ADMIN_EMAIL` | No |

The job builds, applies D1 migrations with `wrangler d1 migrations apply`, and deploys.

## What's next

- [Create the first admin](/admin/first-admin)
- [Set up email](/admin/email)
- [Set up single sign-on](/admin/single-sign-on)
