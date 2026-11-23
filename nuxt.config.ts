import { fileURLToPath } from 'node:url'

// Two deploy targets from one codebase:
//   - Cloudflare (`pnpm build:cloudflare`, preset cloudflare-durable): D1 + R2 + a Durable Object for realtime.
//   - Node/Bun (`pnpm build:node`, preset node-server): libsql SQLite file + filesystem blobs under `.data/`.
// NuxtHub picks the drivers from the preset, so app code only ever imports `hub:db` / `hub:blob`.
const preset = process.env.NITRO_PRESET || ''
const isCloudflare = preset.startsWith('cloudflare')

// Cloudflare resources come from the environment so each deployment (or fork) brings its own account's IDs.
// Create them with `wrangler d1 create ticketer` and `wrangler r2 bucket create ticketer-files`.
const cloudflare = {
  workerName: process.env.CF_WORKER_NAME || 'ticketer',
  d1DatabaseId: process.env.CF_D1_DATABASE_ID || '',
  r2Bucket: process.env.CF_R2_BUCKET || 'ticketer-files',
}
if (isCloudflare && !cloudflare.d1DatabaseId) {
  console.warn('[ticketer] CF_D1_DATABASE_ID is not set: the build works, but `wrangler deploy` needs a real D1 database id.')
  cloudflare.d1DatabaseId = '00000000-0000-0000-0000-000000000000'
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
