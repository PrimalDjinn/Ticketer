import { db, schema } from 'hub:db'

/** Forgets the stored GitHub App (not the app on GitHub). Project links stay, but nothing syncs until an app is set up. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  await deleteSetting('github')
  await db.delete(schema.githubInstallations)
  return { ok: true }
})
