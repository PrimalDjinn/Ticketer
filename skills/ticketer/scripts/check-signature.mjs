#!/usr/bin/env node
// Computes the canonical string and signature of a Ticketer signed launch link, so you can compare them with what
// your own code produces. Node.js 18 or later; no dependencies.
//
//   node check-signature.mjs
//       Checks the worked example from the docs and prints its canonical string and signature.
//   node check-signature.mjs --secret tks_… app=app_… email=jane@example.com ts=1764000000 nonce=… [name=value …]
//       Prints the canonical string, signature and full query for your own parameters (no network calls).
import { createHmac } from 'node:crypto'

const EXAMPLE = {
  secret: 'tks_example_secret',
  params: {
    app: 'app_01jexample0000000000000000',
    email: 'jane@example.com',
    name: 'Jane Doe',
    'context[url]': 'https://app.example.com/reports?id=7',
    ts: '1764000000',
    nonce: '9f86d081884c7d659a2feaa0c55ad015',
  },
  canonical:
    'app=app_01jexample0000000000000000&context%5Burl%5D=https%3A%2F%2Fapp.example.com%2Freports%3Fid%3D7&email=jane%40example.com&name=Jane%20Doe&nonce=9f86d081884c7d659a2feaa0c55ad015&ts=1764000000',
  sig: '7f8e75a7f00a6de5120539b49061aa082d432669cfea9d9de7b7a841e32b8a96',
}

// RFC 3986: encodeURIComponent, plus the five characters it leaves unencoded.
const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

function sign(params, secret) {
  const canonical = Object.entries(params)
    .filter(([name]) => name !== 'sig')
    .map(([name, value]) => [encode(name), encode(String(value))])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`)
    .join('&')
  return { canonical, sig: createHmac('sha256', secret).update(canonical).digest('hex') }
}

const args = process.argv.slice(2)
if (args.includes('-h') || args.includes('--help')) {
  console.log(`Usage:
  node check-signature.mjs                      check the worked example
  node check-signature.mjs --secret <secret> name=value [name=value …]
                                                sign your own parameters (app, email, ts and nonce are required)`)
  process.exit(0)
}

if (!args.length) {
  const { canonical, sig } = sign(EXAMPLE.params, EXAMPLE.secret)
  const ok = canonical === EXAMPLE.canonical && sig === EXAMPLE.sig
  console.log(`canonical: ${canonical}\nsig:       ${sig}`)
  console.log(ok ? '\nOK: matches the worked example.' : '\nMISMATCH with the worked example.')
  process.exit(ok ? 0 : 1)
}

const secretAt = args.indexOf('--secret')
const secret = secretAt >= 0 ? args[secretAt + 1] : process.env.TICKETER_SIGNING_SECRET
if (!secret) {
  console.error('Pass --secret <secret> or set TICKETER_SIGNING_SECRET.')
  process.exit(2)
}
const params = {}
for (const [i, arg] of args.entries()) {
  if (arg === '--secret' || args[i - 1] === '--secret') continue
  const at = arg.indexOf('=')
  if (at < 1) {
    console.error(`Not a name=value pair: ${arg}`)
    process.exit(2)
  }
  const name = arg.slice(0, at)
  if (name in params) {
    console.error(`Each parameter may appear only once: ${name}`)
    process.exit(2)
  }
  params[name] = arg.slice(at + 1)
}
const missing = ['app', 'email', 'ts', 'nonce'].filter((name) => !params[name])
if (missing.length) {
  console.error(`Missing required parameters: ${missing.join(', ')}`)
  process.exit(2)
}
const { canonical, sig } = sign(params, secret)
console.log(`canonical: ${canonical}\nsig:       ${sig}\nquery:     ?${canonical}&sig=${sig}`)
