import { deriveSecret } from 'nuxt/server'

/**
 * Encrypts secrets kept in the database (SMTP password, OIDC client secret, integration signing secrets) with
 * AES-GCM under a key derived from the app secret (NUXT_APP_SECRET, via Nuxt's `deriveSecret`). WebCrypto only, so it
 * runs on Node and Workers alike. Changing the app secret makes stored secrets unreadable: they must be re-entered.
 */
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const PREFIX = 'enc:v1:'

let cachedKey: Promise<CryptoKey> | undefined

async function key() {
  cachedKey ??= deriveSecret('ticketer:stored-secrets').then((hex) => {
    const raw = new Uint8Array(hex.match(/../g)!.map((byte) => parseInt(byte, 16)))
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  })
  return cachedKey.catch((error) => {
    cachedKey = undefined
    throw error
  })
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

export async function encryptSecret(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), encoder.encode(plain)))
  return `${PREFIX}${toBase64(iv)}.${toBase64(cipher)}`
}

/** Returns null when the value cannot be decrypted (e.g. the app secret changed). */
export async function decryptSecret(stored: string | null | undefined) {
  if (!stored) return null
  if (!stored.startsWith(PREFIX)) return null
  const [iv, cipher] = stored.slice(PREFIX.length).split('.')
  if (!iv || !cipher) return null
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, await key(), fromBase64(cipher))
    return decoder.decode(plain)
  } catch {
    useLogger('secrets').warn('a stored secret could not be decrypted; was NUXT_APP_SECRET changed? Re-enter it in Settings.')
    return null
  }
}
