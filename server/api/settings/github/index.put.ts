import { z } from 'zod'

const body = z.object({
  appId: z.string().trim().regex(/^\d{1,12}$/, 'The App ID is a number'),
  slug: z.string().trim().regex(/^[a-z0-9-]{1,100}$/i, 'The URL name has letters, numbers and dashes only'),
  /** A new key or secret; leave out to keep the current one. */
  privateKey: z.string().trim().max(10_000).refine((v) => /-----BEGIN (RSA )?PRIVATE KEY-----/.test(v), 'Paste the whole .pem file').optional(),
  webhookSecret: z.string().trim().min(8).max(200).optional(),
})

/** Enters an existing GitHub App by hand. Fields set by NUXT_GITHUB_* keep their environment values. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const input = await readValidatedBody(event, body.parse)
  const current = (await getSetting('github', githubSettingsShape)) ?? githubSettingsShape.parse({})
  const next = {
    ...current,
    appId: input.appId,
    slug: input.slug.toLowerCase(),
    ...(input.privateKey && { privateKey: await encryptSecret(input.privateKey) }),
    ...(input.webhookSecret && { webhookSecret: await encryptSecret(input.webhookSecret) }),
  }
  if (current.appId !== input.appId) Object.assign(next, { owner: '', htmlUrl: '' })
  await setSetting('github', next)
  useLogger('settings').info('GitHub App saved', { appId: input.appId, slug: next.slug })
  return { ok: true }
})
