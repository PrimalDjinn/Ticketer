import { z } from 'zod'
import { db, schema } from 'hub:db'

const query = z.object({
  installation_id: z.coerce.number().int().positive().optional(),
  setup_action: z.string().max(40).optional(),
  state: z.string().max(500).optional(),
})
const installation = z.object({ id: z.number(), account: z.object({ login: z.string(), type: z.string().optional() }).nullable(), suspended_at: z.string().nullable().optional() })

/**
 * GitHub sends people here after installing (or changing) the app. The installation is checked with GitHub (it must
 * belong to this app), recorded, and the person goes back to where they started.
 */
export default defineEventHandler(async (event) => {
  await requireStaff(event)
  const input = await getValidatedQuery(event, query.parse)
  const back = (await readState(input.state))?.match(/^install:[^:]+:(\/[\w\-/]*)$/)?.[1] ?? '/settings/github'
  if (input.installation_id) {
    const config = await requireGithubConfig(event)
    const found = installation.safeParse(await asApp(config, `/app/installations/${input.installation_id}`).catch(() => null))
    if (!found.success) throw createError({ status: 400, message: 'That installation doesn’t belong to this GitHub App' })
    await db
      .insert(schema.githubInstallations)
      .values({ id: found.data.id, accountLogin: found.data.account?.login ?? 'unknown', accountType: found.data.account?.type ?? 'User', suspended: !!found.data.suspended_at })
      .onConflictDoUpdate({ target: schema.githubInstallations.id, set: { accountLogin: found.data.account?.login ?? 'unknown', suspended: !!found.data.suspended_at } })
  }
  return sendRedirect(event, `${back}${back.includes('?') ? '&' : '?'}github=installed`)
})
