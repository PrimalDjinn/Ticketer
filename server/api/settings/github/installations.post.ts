import { z } from 'zod'
import { db, schema } from 'hub:db'

const installations = z.array(z.object({ id: z.number(), account: z.object({ login: z.string(), type: z.string().optional() }).nullable(), suspended_at: z.string().nullable().optional() }))

/** Re-reads where the app is installed, from GitHub (useful if a webhook was missed). */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const config = await requireGithubConfig(event)
  const list = installations.parse(await asApp(config, '/app/installations?per_page=100'))
  await db.delete(schema.githubInstallations)
  if (list.length) {
    await db.insert(schema.githubInstallations).values(
      list.map((i) => ({ id: i.id, accountLogin: i.account?.login ?? 'unknown', accountType: i.account?.type ?? 'User', suspended: !!i.suspended_at })),
    )
  }
  return { count: list.length }
})
