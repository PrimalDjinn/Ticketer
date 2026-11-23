import { eq, or } from 'drizzle-orm'
import { ulid } from 'ulid'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const adminEnv = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8, 'NUXT_ADMIN_PASSWORD must be at least 8 characters'),
  name: z.string().trim().regex(/^[a-zA-Z0-9_]{3,30}$/, 'NUXT_ADMIN_NAME must be 3-30 letters, numbers or underscores'),
})

let done: Promise<void> | undefined

/**
 * Creates the admin from NUXT_ADMIN_EMAIL / NUXT_ADMIN_PASSWORD (/ NUXT_ADMIN_NAME) if no account uses that email yet.
 * Runs once per process (Node) or isolate (Workers); an existing account is left untouched, so rotating the env var
 * never resets a password someone has since changed.
 */
export function ensureInitialAdmin() {
  done ??= (async () => {
    const log = useLogger('bootstrap')
    const config = useRuntimeConfig().admin
    if (!config.email && !config.password) return
    const parsed = adminEnv.safeParse(config)
    if (!parsed.success) {
      log.error('Initial admin not created:', parsed.error.issues.map((i) => i.message).join('; '))
      return
    }
    const { email, password, name } = parsed.data
    const existing = await db.query.users.findFirst({
      where: or(eq(schema.users.email, email), eq(schema.users.name, name)),
      columns: { email: true },
    })
    if (existing) {
      if (existing.email !== email) log.warn(`Initial admin not created: the username "${name}" is taken; set NUXT_ADMIN_NAME`)
      return
    }
    await db.insert(schema.users).values({
      id: ulid(),
      email,
      name,
      passwordHash: await hashPassword(password),
      role: 'admin',
      isGuest: false,
    })
    log.success(`Created initial admin ${email}`)
  })().catch((error) => {
    done = undefined // retry on the next request (e.g. the database was not ready yet)
    useLogger('bootstrap').error('Initial admin setup failed', error)
  })
  return done
}
