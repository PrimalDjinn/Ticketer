import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const page = z.object({
  repositories: z.array(z.object({ id: z.number(), full_name: z.string(), private: z.boolean(), html_url: z.string() })),
})

/** Repositories the app can reach, across its installations, and which project each is linked to. */
export default defineEventHandler(async (event) => {
  await requireStaff(event)
  const config = await requireGithubConfig(event)
  const installations = await db.select().from(schema.githubInstallations).where(eq(schema.githubInstallations.suspended, false))
  const links = await db
    .select({ repoId: schema.projectGithub.repoId, key: schema.projects.key, name: schema.projects.name })
    .from(schema.projectGithub)
    .innerJoin(schema.projects, eq(schema.projectGithub.projectId, schema.projects.id))
  const repos = []
  const problems: string[] = []
  for (const installation of installations) {
    try {
      const result = page.parse(await asInstallation(config, installation.id, '/installation/repositories?per_page=100'))
      for (const r of result.repositories) {
        const linked = links.find((l) => l.repoId === r.id)
        repos.push({ id: r.id, fullName: r.full_name, private: r.private, url: r.html_url, installationId: installation.id, linkedTo: linked ? { key: linked.key, name: linked.name } : null })
      }
    } catch (error) {
      problems.push(`${installation.accountLogin}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  repos.sort((a, b) => a.fullName.localeCompare(b.fullName))
  return { repositories: repos, installations: installations.length, problems }
})
