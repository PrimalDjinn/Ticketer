import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'

// Two deploy targets from one codebase:
//   - Cloudflare (`pnpm build:cloudflare`, preset cloudflare-durable): D1 + R2 + a Durable Object for realtime.
//   - Node/Bun (`pnpm build:node`, preset node-server): libsql SQLite file + filesystem blobs under `.data/`.
// NuxtHub picks the drivers from the preset, so app code only ever imports `hub:db` / `hub:blob`.
const preset = process.env.NITRO_PRESET || ''
const isCloudflare = preset.startsWith('cloudflare')

// Cloudflare resources are declared in ./wrangler.jsonc; scripts/build.mjs applies per-deployment IDs from the
// environment (CF_D1_DATABASE_ID, CF_R2_BUCKET, CF_WORKER_NAME, CF_CUSTOM_DOMAIN, CF_SEND_EMAIL) after the build.

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxtjs/mdc', '@nuxthub/core', 'nuxt-auth-utils'],

  // Markdown in descriptions and comments, rendered with Nuxt UI's prose components. See app/utils/markdown.ts.
  // No syntax highlighting (Nuxt UI turns it on): it would add shiki and its grammars to the Worker bundle.
  mdc: { headings: { anchorLinks: false }, highlight: false },

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'Ticketer',
      htmlAttrs: { lang: 'en' },
      link: [{ rel: 'icon', href: '/favicon.ico' }],
    },
  },

  hub: {
    db: isCloudflare
      ? // No database id here: the `DB` binding comes from wrangler.jsonc (NuxtHub would add a duplicate binding).
        { dialect: 'sqlite', driver: 'd1' }
      : {
          dialect: 'sqlite',
          // Production builds read LIBSQL_URL at runtime (see server/plugins/00.database-url.ts). Dev pins its own
          // file so a DATABASE_URL left over from another project (e.g. postgres://) can never be picked up.
          driver: 'libsql',
          ...(process.env.NODE_ENV !== 'production' && { connection: { url: process.env.LIBSQL_URL || 'file:.data/db/sqlite.db' } }),
          // The database lives on the container volume, not the build machine: migrations run on boot
          // (server/plugins/migrations.ts) instead of at build time.
          applyMigrationsDuringBuild: false,
        },
    // Relative on purpose: NuxtHub would otherwise bake the build machine's absolute path into the server bundle.
    // Resolved against the working directory at runtime (`/app/.data/blob` in the Docker image).
    blob: isCloudflare ? { driver: 'cloudflare-r2', binding: 'BLOB' } : { driver: 'fs', dir: '.data/blob' },
  },

  runtimeConfig: {
    // Public API and webhooks (docs/reference/api.md, docs/reference/webhooks.md).
    api: {
      // Requests per minute per access token (NUXT_API_RATE_LIMIT). Counted per server process or Worker instance.
      rateLimit: 600,
    },
    webhooks: {
      // Let webhooks reach private and local addresses, and plain http (NUXT_WEBHOOKS_ALLOW_PRIVATE_NETWORK), for
      // receivers such as n8n on the same network. Off by default: it lets admins make the server call internal hosts.
      allowPrivateNetwork: false,
    },
    // Public address (NUXT_SITE_URL), e.g. https://tickets.example.com. Used for links in emails sent by scheduled jobs
    // such as due-date reminders, which have no request to read it from. Unset = the address the team last used.
    siteUrl: '',
    // Initial admin, created on first start when no account has this email (NUXT_ADMIN_EMAIL, NUXT_ADMIN_PASSWORD,
    // NUXT_ADMIN_NAME). An existing account is never modified. See also `pnpm admin`.
    admin: {
      email: '',
      password: '',
      name: 'admin',
    },
    mail: {
      // Sender for password reset mail (NUXT_MAIL_FROM), e.g. "Ticketer <noreply@your-domain>". On Cloudflare the
      // domain must be onboarded to Email Sending. Unset = reset links are logged instead of mailed.
      from: '',
      // Node only: SMTP connection string, e.g. smtps://user:pass@smtp.gmail.com:465
      smtpUrl: '',
    },
    // GitHub issues sync (NUXT_GITHUB_*): a GitHub App, usually created from Settings → GitHub. Each field set here wins
    // over the stored one. apiUrl/webUrl point at GitHub Enterprise Server when set.
    github: {
      appId: '',
      appSlug: '',
      privateKey: '', // PEM; literal \n sequences are accepted
      webhookSecret: '',
      apiUrl: '', // default https://api.github.com
      webUrl: '', // default https://github.com
    },
    // Bot protection for sign-up, password reset and visitor tickets/chats (NUXT_CAPTCHA_*): provider turnstile,
    // recaptcha (v2 checkbox) or none. Each field set here wins over Settings → Bot protection.
    captcha: {
      provider: '',
      siteKey: '',
      secretKey: '',
    },
    // Single sign-on with any OpenID Connect provider (Authentik, Keycloak, Entra ID, Google…), NUXT_OIDC_*. Each field
    // set here wins over Settings → Sign-in, where admins can configure the rest. Empty = not pinned. See the README.
    oidc: {
      enabled: '', // NUXT_OIDC_ENABLED: true/false; implied true when issuer and client id both come from env
      issuer: '', // NUXT_OIDC_ISSUER, e.g. https://auth.example.com/application/o/ticketer/
      clientId: '',
      clientSecret: '',
      name: '', // button label; default "Single sign-on"
      scopes: '', // default "openid email profile"
      defaultRole: '', // role for brand-new people: external (default), viewer, member, or none
      groupsClaim: '', // default "groups"
      roleGroups: '', // e.g. admin:ticketer-admins,member:staff,viewer:auditors,external:customers
      only: '', // true = hide the password form and password sign-up/reset
      redirectUrl: '', // only behind proxies that hide the public origin: https://tickets.example.com/auth/oidc/callback
    },
    public: {
      // NUXT_PUBLIC_APP_NAME: the name shown everywhere. Empty = Settings → Branding ("Ticketer" until set there).
      appName: '',
    },
  },

  nitro: {
    // Workers send mail through the EMAIL binding; keep the SMTP client out of the Worker bundle.
    alias: isCloudflare ? { nodemailer: fileURLToPath(new URL('./server/stubs/nodemailer.ts', import.meta.url)) } : {},
    // Email templates in server/emails are Vue components (Vue Email); the server bundle needs to compile them.
    rollupConfig: { plugins: [vue()] },
    experimental: {
      websocket: true,
      tasks: true,
    },
    // Hourly; the job itself only acts at the hour chosen in Settings → Reminders. On Cloudflare the same cron must be
    // listed under `triggers.crons` in wrangler.jsonc.
    scheduledTasks: {
      '0 * * * *': ['reminders:due'],
      '* * * * *': ['webhooks:deliver'],
    },
    // Migrations ship with the server so the Node build can apply them to the volume on boot.
    serverAssets: [{ baseName: 'migrations', dir: './db/migrations/sqlite' }],
    // Bindings, the Durable Object and its migrations live in ./wrangler.jsonc, which Nitro merges into the output.
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },

  vite: {
    optimizeDeps: { include: ['zod', '@vueuse/core'] },
  },

  icon: {
    serverBundle: { collections: ['lucide'] },
  },

  typescript: {
    strict: true,
  },
})
