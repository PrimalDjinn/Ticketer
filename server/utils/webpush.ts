/**
 * Web Push with WebCrypto only (runs on Node and Workers): message encryption per RFC 8291 (aes128gcm) and sender
 * identification per RFC 8292 (VAPID). The VAPID key pair is created on first use and kept in Settings, the private
 * half encrypted with `encryptSecret`, so deployments need no setup.
 */
import { z } from 'zod'
import { db, schema } from 'hub:db'

const log = useLogger('push')
const encoder = new TextEncoder()

export const base64url = {
  encode(bytes: Uint8Array) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  decode(text: string): Uint8Array<ArrayBuffer> {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  },
}

const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// VAPID keys
// ---------------------------------------------------------------------------------------------------------------------

const vapidShape = z.object({ publicKey: z.string().min(80), privateKey: z.string().min(10) })
let cachedVapid: Promise<{ publicKey: string; signingKey: CryptoKey }> | undefined

async function loadVapid(retried = false): Promise<{ publicKey: string; signingKey: CryptoKey }> {
  let stored = await getSetting('vapid', vapidShape)
  if (!stored) {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const publicKey = base64url.encode(new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer))
    const privateKey = await encryptSecret(JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)))
    // Two isolates may race on the very first push; whichever row lands first wins and both re-read it.
    if (!(await getSetting('vapid', vapidShape))) await setSetting('vapid', { publicKey, privateKey })
    stored = (await getSetting('vapid', vapidShape))!
    log.info('created the VAPID key pair for Web Push')
  }
  const jwk = await decryptSecret(stored.privateKey)
  if (!jwk) {
    if (retried) throw new Error('A new Web Push key could not be stored and read back')
    // NUXT_APP_SECRET changed: the old key is unusable. Start over with a new pair; every browser's subscription
    // belonged to the old key, so they are dropped and people turn push on again.
    log.warn('the Web Push key could not be decrypted (NUXT_APP_SECRET changed?); creating a new one; browsers re-subscribe the next time they open Ticketer')
    await deleteSetting('vapid')
    await db.delete(schema.pushSubscriptions)
    return loadVapid(true)
  }
  const signingKey = await crypto.subtle.importKey('jwk', JSON.parse(jwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  return { publicKey: stored.publicKey, signingKey }
}

export function vapidKeys() {
  cachedVapid ??= loadVapid().catch((error) => {
    cachedVapid = undefined
    throw error
  })
  return cachedVapid
}

/** `Authorization` header value for a push service (RFC 8292). */
async function vapidAuthorization(endpoint: string, subject: string) {
  const { publicKey, signingKey } = await vapidKeys()
  const header = base64url.encode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = base64url.encode(
    encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: subject })),
  )
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, encoder.encode(`${header}.${claims}`)))
  return `vapid t=${header}.${claims}.${base64url.encode(signature)}, k=${publicKey}`
}

// ---------------------------------------------------------------------------------------------------------------------
// Payload encryption (RFC 8291, aes128gcm content coding of RFC 8188, one record)
// ---------------------------------------------------------------------------------------------------------------------

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bits: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bits))
}

export async function encryptPushPayload(subscription: { p256dh: string; auth: string }, payload: Uint8Array<ArrayBuffer>) {
  const uaPublic = base64url.decode(subscription.p256dh)
  const authSecret = base64url.decode(subscription.auth)
  const ephemeral = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', ephemeral.publicKey)) as ArrayBuffer)
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, ephemeral.privateKey, 256))

  const ikm = await hkdf(authSecret, ecdhSecret, concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic), 256)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 128)
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 96)

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // 0x02 marks the last (only) record; no padding.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))))
  const recordSize = new Uint8Array([0, 0, 16, 0]) // 4096
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, cipher)
}

// ---------------------------------------------------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------------------------------------------------

export interface PushMessage {
  title: string
  body: string
  /** Opened when the notification is clicked (path on this site). */
  link?: string | null
  /** Notifications with the same tag replace each other on the device. */
  tag?: string
}

export type PushResult = 'sent' | 'gone' | 'failed'

/** Sends one message to one browser. `gone` means the subscription is no longer valid and should be deleted. */
export async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  message: PushMessage,
  options: { subject: string; ttl?: number; urgency?: 'low' | 'normal' | 'high' },
): Promise<PushResult> {
  try {
    const body = await encryptPushPayload(subscription, encoder.encode(JSON.stringify(message)))
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthorization(subscription.endpoint, options.subject),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(options.ttl ?? 24 * 60 * 60),
        Urgency: options.urgency ?? 'normal',
      },
      body,
    })
    if (response.ok) return 'sent'
    if (response.status === 404 || response.status === 410) return 'gone'
    log.warn('push service refused a message', { status: response.status, host: new URL(subscription.endpoint).host, reason: (await response.text()).slice(0, 200) })
    return 'failed'
  } catch (error) {
    log.warn('push failed', { host: new URL(subscription.endpoint).host, error: error instanceof Error ? error.message : String(error) })
    return 'failed'
  }
}
