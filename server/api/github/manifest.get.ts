import { z } from 'zod'

const query = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/), state: z.string().max(500) })
const conversion = z.object({
  id: z.number(),
  slug: z.string(),
  html_url: z.string(),
  owner: z.object({ login: z.string() }).nullable().optional(),
  pem: z.string(),
  webhook_secret: z.string().nullable(),
})

/** Step 2 of the app-manifest flow: GitHub sends the admin here; exchange the code for the new app's keys and keep them. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { code, state } = await getValidatedQuery(event, query.parse)
  if ((await readState(state)) !== `manifest:${admin.id}`) throw createError({ status: 400, message: 'This link expired. Start again from Settings → GitHub.' })
  const config = await githubConfig(event, { decrypt: false })
  const response = await fetch(`${config.apiUrl}/app-manifests/${code}/conversions`, {
    method: 'POST',
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'Ticketer', 'x-github-api-version': '2022-11-28' },
  })
  const app = conversion.safeParse(await response.json().catch(() => null))
  if (!response.ok || !app.success) throw createError({ status: 502, message: 'GitHub didn’t return the new app’s keys. Start again from Settings → GitHub.' })
  await setSetting('github', {
    appId: String(app.data.id),
    slug: app.data.slug,
    privateKey: await encryptSecret(app.data.pem),
    webhookSecret: app.data.webhook_secret ? await encryptSecret(app.data.webhook_secret) : '',
    owner: app.data.owner?.login ?? '',
    htmlUrl: app.data.html_url,
  })
  useLogger('github').info('GitHub App created', { appId: app.data.id, slug: app.data.slug })
  return sendRedirect(event, '/settings/github?created=1')
})
