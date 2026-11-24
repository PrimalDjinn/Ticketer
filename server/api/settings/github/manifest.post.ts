import { z } from 'zod'

const body = z.object({
  /** Create the app under this organisation instead of the admin's own account. */
  organization: z
    .string()
    .trim()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,38})$/i, 'Enter the organisation’s login, e.g. acme')
    .optional()
    .or(z.literal('')),
  name: z.string().trim().min(3).max(34),
})

/**
 * Step 1 of creating the GitHub App with GitHub's app-manifest flow: returns the form the browser posts to GitHub.
 * GitHub then sends the admin back to /api/github/manifest with a code that the server exchanges for the app's keys.
 */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const input = await readValidatedBody(event, body.parse)
  const config = await githubConfig(event, { decrypt: false })
  const origin = siteOrigin(event)
  const manifest = {
    name: input.name,
    url: origin,
    description: 'Two-way sync between GitHub issues and project tasks.',
    hook_attributes: { url: `${origin}/api/github/webhook`, active: true },
    redirect_url: `${origin}/api/github/manifest`,
    setup_url: `${origin}/api/github/setup`,
    setup_on_update: true,
    public: false,
    default_permissions: { issues: 'write', metadata: 'read' },
    default_events: ['issues', 'issue_comment'],
  }
  const base = input.organization ? `${config.webUrl}/organizations/${input.organization}/settings/apps/new` : `${config.webUrl}/settings/apps/new`
  const state = await signState(`manifest:${admin.id}`)
  return { action: `${base}?state=${encodeURIComponent(state)}`, manifest: JSON.stringify(manifest) }
})
