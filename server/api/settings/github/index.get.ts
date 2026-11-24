import { asc } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Settings → GitHub: the app, where it's installed, and the addresses GitHub needs. Secrets are never sent back. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const config = await githubConfig(event, { decrypt: false })
  const installations = await db.select().from(schema.githubInstallations).orderBy(asc(schema.githubInstallations.accountLogin))
  const origin = siteOrigin(event)
  return {
    configured: !config.problem,
    problem: config.problem,
    appId: config.appId,
    slug: config.slug,
    owner: config.owner,
    appUrl: config.htmlUrl || (config.slug ? `${config.webUrl}/apps/${config.slug}` : null),
    installUrl: config.slug ? `${config.webUrl}/apps/${config.slug}/installations/new` : null,
    privateKeySet: !!config.privateKey,
    webhookSecretSet: !!config.webhookSecret,
    sources: config.sources,
    webUrl: config.webUrl,
    webhookUrl: `${origin}/api/github/webhook`,
    installations: installations.map((i) => ({ id: i.id, account: i.accountLogin, type: i.accountType, suspended: i.suspended })),
  }
})
