import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import { db, schema } from 'hub:db'

/**
 * Instance settings edited by admins in Settings, stored as JSON in the `settings` table. Environment variables still
 * win where a feature has one (see each feature's resolver, e.g. `mailConfig`), so deployments can pin values.
 */
export async function getSetting<S extends z.ZodType>(key: string, shape: S): Promise<z.output<S> | undefined> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, key) })
  if (row?.value === undefined) return undefined
  const parsed = shape.safeParse(row.value)
  if (!parsed.success) {
    useLogger('settings').warn(`ignoring invalid stored setting "${key}"`, parsed.error.issues)
    return undefined
  }
  return parsed.data
}

export async function setSetting(key: string, value: unknown) {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
}

export async function deleteSetting(key: string) {
  await db.delete(schema.settings).where(eq(schema.settings.key, key))
}

/**
 * Where a setting's effective value comes from, for the Settings UI: `env` values are read-only there.
 * Secrets are never sent back; the UI only learns whether one is set.
 */
export type SettingSource = 'env' | 'settings' | 'unset'
