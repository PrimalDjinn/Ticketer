import { fileURLToPath } from 'node:url'

// Two deploy targets from one codebase:
//   - Cloudflare (`pnpm build:cloudflare`, preset cloudflare-durable): D1 + R2 + a Durable Object for realtime.
//   - Node/Bun (`pnpm build:node`, preset node-server): libsql SQLite file + filesystem blobs under `.data/`.
// NuxtHub picks the drivers from the preset, so app code only ever imports `hub:db` / `hub:blob`.
const preset = process.env.NITRO_PRESET || ''
const isCloudflare = preset.startsWith('cloudflare')

// Cloudflare resource identifiers. These are not secrets; override them per environment if you fork the app.
const cloudflare = {
  workerName: process.env.CF_WORKER_NAME || 'ticketer',
  d1DatabaseId: process.env.CF_D1_DATABASE_ID || 'f1d2b5d3-0000-0000-0000-000000000000',
  r2Bucket: process.env.CF_R2_BUCKET || 'ticketer-files',
}

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxthub/core', 'nuxt-auth-utils'],

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
      ? { dialect: 'sqlite', driver: 'd1', connection: { databaseId: cloudflare.d1DatabaseId } }
      : {
          dialect: 'sqlite',
          // libsql reads DATABASE_URL at runtime in production builds, `.data/db/sqlite.db` in dev.
          driver: 'libsql',
          // The database lives on the container volume, not the build machine: migrations run on boot
          // (server/plugins/migrations.ts) instead of at build time.
          applyMigrationsDuringBuild: false,
        },
    // Relative on purpose: NuxtHub would otherwise bake the build machine's absolute path into the server bundle.
    // Resolved against the working directory at runtime (`/app/.data/blob` in the Docker image).
    blob: isCloudflare ? { driver: 'cloudflare-r2', binding: 'BLOB', bucketName: cloudflare.r2Bucket } : { driver: 'fs', dir: '.data/blob' },
  },

  runtimeConfig: {
    // Shared secret for Worker -> Durable Object publish calls. Only checked on Cloudflare.
    realtimeSecret: '',
    mail: {
      // Sender for password reset mail (NUXT_MAIL_FROM), e.g. "Ticketer <noreply@your-domain>". On Cloudflare the
      // domain must be onboarded to Email Sending. Unset = reset links are logged instead of mailed.
      from: '',
      // Node only: SMTP connection string, e.g. smtps://user:pass@smtp.gmail.com:465
      smtpUrl: '',
    },
    public: {
      appName: 'Ticketer',
    },
  },

  nitro: {
    // Workers send mail through the EMAIL binding; keep the SMTP client out of the Worker bundle.
    alias: isCloudflare ? { nodemailer: fileURLToPath(new URL('./server/stubs/nodemailer.ts', import.meta.url)) } : {},
    experimental: {
      websocket: true,
      tasks: true,
    },
    // Migrations ship with the server so the Node build can apply them to the volume on boot.
    serverAssets: [{ baseName: 'migrations', dir: './db/migrations/sqlite' }],
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
      wrangler: {
        name: cloudflare.workerName,
        observability: { enabled: true, logs: { enabled: true, invocation_logs: true } },
        durable_objects: {
          bindings: [{ name: '$DurableObject', class_name: '$DurableObject' }],
        },
        migrations: [{ tag: 'v1', new_sqlite_classes: ['$DurableObject'] }],
        send_email: [{ name: 'EMAIL' }],
      },
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
