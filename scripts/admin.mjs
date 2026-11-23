#!/usr/bin/env node
/**
 * Create an admin, or promote an existing account, in a Node/Docker (SQLite) deployment.
 *
 *   pnpm admin --email you@example.com [--password '…'] [--name you]
 *   docker compose -f docker-compose.prod.yml exec ticketer node scripts/admin.mjs --email you@example.com
 *
 * Without --password you are prompted for one when a new account is created. For an existing account the password is
 * only changed when --password (or --reset-password) is given. The database is LIBSQL_URL, default .data/db/sqlite.db.
 *
 * Cloudflare (D1): set the NUXT_ADMIN_EMAIL / NUXT_ADMIN_PASSWORD secrets instead; the app creates the admin itself.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'
import { createInterface } from 'node:readline/promises'

// Resolve dependencies from the built server (Docker image: a trimmed, ESM-only node_modules) or the source checkout.
const roots = ['.output/server/node_modules', 'node_modules'].map((p) => resolve(process.cwd(), p))

/** Minimal ESM resolution through package.json "exports" (the "import" entry), enough for the two packages used. */
function pick(entry) {
  if (typeof entry === 'string') return entry
  if (!entry || typeof entry !== 'object') return undefined
  return pick(entry.import) ?? pick(entry.node) ?? pick(entry.default)
}
async function load(specifier) {
  const parts = specifier.split('/')
  const pkg = parts.slice(0, specifier.startsWith('@') ? 2 : 1).join('/')
  const subpath = ['.', ...parts.slice(specifier.startsWith('@') ? 2 : 1)].join('/')
  for (const root of roots) {
    const manifestPath = resolve(root, pkg, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const target = pick(manifest.exports?.[subpath] ?? (subpath === '.' ? (manifest.exports ?? manifest.module ?? manifest.main) : undefined))
    const file = target && resolve(root, pkg, target)
    if (file && existsSync(file)) return import(pathToFileURL(file).href)
  }
  throw new Error(`Cannot find ${specifier}; run this from the app directory (after pnpm install or pnpm build:node)`)
}

const { values: args } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    name: { type: 'string' },
    'reset-password': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})
if (args.help || !args.email) {
  console.log('Usage: pnpm admin --email you@example.com [--password …] [--name you] [--reset-password]')
  process.exit(args.help ? 0 : 1)
}

const email = args.email.trim().toLowerCase()
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('That does not look like an email address')

const url = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || 'file:.data/db/sqlite.db'
if (url.startsWith('file:')) mkdirSync(dirname(url.slice('file:'.length)), { recursive: true })
const { createClient } = await load('@libsql/client')
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN })

const tables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
if (!tables.rows.length) fail(`No users table in ${url}. Start the app once so it can apply its migrations, then retry.`)

const existing = (await client.execute({ sql: 'SELECT id, name, role FROM users WHERE email = ?', args: [email] })).rows[0]
const wantsPassword = !existing || args.password || args['reset-password']
const password = wantsPassword ? (args.password ?? (await prompt(existing ? 'New password: ' : 'Password: '))) : undefined
if (password !== undefined && password.length < 8) fail('Use at least 8 characters for the password')

let passwordHash
if (password !== undefined) {
  // Same hasher (and default parameters) the app verifies with, via nuxt-auth-utils.
  const { Hash } = await load('@adonisjs/hash')
  const { Scrypt } = await load('@adonisjs/hash/drivers/scrypt')
  passwordHash = await new Hash(new Scrypt({})).make(password)
}

if (existing) {
  await client.execute({
    sql: `UPDATE users SET role = 'admin', is_guest = 0${passwordHash ? ', password_hash = ?' : ''} WHERE id = ?`,
    args: passwordHash ? [passwordHash, existing.id] : [existing.id],
  })
  console.log(`✔ ${email} (${existing.name}) is now an admin${passwordHash ? ' with a new password' : ''}.`)
} else {
  let name = (args.name ?? email.split('@')[0]).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30)
  if (name.length < 3) name = `${name}admin`
  const taken = await client.execute({ sql: 'SELECT 1 FROM users WHERE name = ?', args: [name] })
  if (taken.rows.length) name = `${name.slice(0, 25)}_${randomBytes(2).toString('hex')}`
  await client.execute({
    sql: "INSERT INTO users (id, email, name, password_hash, role, is_guest) VALUES (?, ?, ?, ?, 'admin', 0)",
    args: [ulid(), email, name, passwordHash],
  })
  console.log(`✔ Created admin ${email} (username ${name}).`)
}

function ulid() {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  let time = Date.now()
  let out = ''
  for (let i = 0; i < 10; i++) {
    out = alphabet[time % 32] + out
    time = Math.floor(time / 32)
  }
  for (const byte of randomBytes(16)) out += alphabet[byte % 32]
  return out
}

async function prompt(question) {
  if (!process.stdin.isTTY) fail('Pass --password when not running interactively')
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  // Hide what is typed.
  rl._writeToOutput = function (text) {
    this.output.write(text.startsWith(question) ? question : '')
  }
  const answer = await rl.question(question)
  rl.close()
  process.stdout.write('\n')
  return answer
}

function fail(message) {
  console.error(`✖ ${message}`)
  process.exit(1)
}
