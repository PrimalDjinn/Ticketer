#!/usr/bin/env node
/**
 * `pnpm build`: builds for the right place.
 *   - NITRO_PRESET set            → that preset
 *   - Cloudflare Workers Builds   → cloudflare-durable (WORKERS_CI=1 is set there, e.g. by the Deploy button)
 *   - otherwise                   → node-server
 *
 * Cloudflare builds then finish the generated .output/server/wrangler.json: Nitro has merged ./wrangler.jsonc into
 * it, and this script applies per-deployment settings from the environment:
 *   CF_WORKER_NAME       Worker name (default from wrangler.jsonc)
 *   CF_D1_DATABASE_ID    use an existing D1 database (otherwise wrangler creates one on first deploy)
 *   CF_R2_BUCKET         use an existing R2 bucket (otherwise wrangler creates one on first deploy)
 *   CF_CUSTOM_DOMAIN     serve on this hostname (its zone must be on the same account)
 *   CF_SEND_EMAIL=true   add the EMAIL send_email binding (Cloudflare Email Sending)
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const preset = process.env.NITRO_PRESET || (process.env.WORKERS_CI ? 'cloudflare-durable' : 'node-server')
console.log(`[ticketer] building with preset ${preset}`)
// Run the project's own Nuxt CLI with this Node, so it works with or without node_modules/.bin on PATH.
const nuxtBin = join(dirname(createRequire(import.meta.url).resolve('nuxt/package.json')), 'bin', 'nuxt.mjs')
const result = spawnSync(process.execPath, [nuxtBin, 'build'], { stdio: 'inherit', env: { ...process.env, NITRO_PRESET: preset } })
if (result.error) console.error('[ticketer] could not start the Nuxt build:', result.error.message)
if (result.status !== 0) process.exit(result.status ?? 1)
if (!preset.startsWith('cloudflare')) process.exit(0)

const path = '.output/server/wrangler.json'
if (!existsSync(path)) {
  console.error(`[ticketer] ${path} was not generated`)
  process.exit(1)
}
const config = JSON.parse(readFileSync(path, 'utf8'))
const env = process.env

// Nitro concatenates arrays when merging configs; keep one entry per binding.
const dedupe = (list, key) => (Array.isArray(list) ? [...new Map(list.map((item) => [item[key] ?? JSON.stringify(item), item])).values()] : list)
for (const [field, key] of [['d1_databases', 'binding'], ['r2_buckets', 'binding'], ['send_email', 'name'], ['routes', 'pattern'], ['compatibility_flags', undefined]]) {
  if (!config[field]) continue
  config[field] = key ? dedupe(config[field], key) : [...new Set(config[field])]
}
if (config.durable_objects?.bindings) config.durable_objects.bindings = dedupe(config.durable_objects.bindings, 'name')
if (Array.isArray(config.migrations)) config.migrations = dedupe(config.migrations, 'tag')

if (env.CF_WORKER_NAME) config.name = env.CF_WORKER_NAME
const db = config.d1_databases?.find((d) => d.binding === 'DB')
if (db && env.CF_D1_DATABASE_ID) db.database_id = env.CF_D1_DATABASE_ID
if (db && env.CF_D1_DATABASE_NAME) db.database_name = env.CF_D1_DATABASE_NAME
const blob = config.r2_buckets?.find((b) => b.binding === 'BLOB')
if (blob && env.CF_R2_BUCKET) blob.bucket_name = env.CF_R2_BUCKET
if (env.CF_SEND_EMAIL === 'true' && !config.send_email?.some((b) => b.name === 'EMAIL')) {
  config.send_email = [...(config.send_email ?? []), { name: 'EMAIL' }]
}
if (env.CF_CUSTOM_DOMAIN) config.routes = [{ pattern: env.CF_CUSTOM_DOMAIN, custom_domain: true }]

writeFileSync(path, JSON.stringify(config, null, 2))
console.log(
  `[ticketer] ${path}: worker "${config.name}", D1 ${db?.database_id ? db.database_id : 'auto-provisioned'}, R2 ${blob?.bucket_name ?? 'auto-provisioned'}` +
    `${config.send_email?.length ? ', email on' : ''}${config.routes?.length ? `, domain ${config.routes[0].pattern}` : ''}`,
)
