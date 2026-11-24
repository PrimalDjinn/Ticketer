import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({
  installationId: z.number().int().positive(),
  repoId: z.number().int().positive(),
  createIssues: z.boolean().default(true),
  importIssues: z.boolean().default(true),
  commentsFromGithub: z.boolean().default(true),
  commentsToGithub: z.boolean().default(false),
})
const repo = z.object({ id: z.number(), full_name: z.string() })

/** Links the project to a repository, or changes the sync options. */
export default defineEventHandler(async (event) => {
  const user = await requireEditor(event)
  const { key } = await getValidatedRouterParams(event, projectKeyParams.parse)
  const input = await readValidatedBody(event, body.parse)
  const project = await loadProject(key)
  const config = await requireGithubConfig(event)
  const installation = await db.query.githubInstallations.findFirst({ where: eq(schema.githubInstallations.id, input.installationId) })
  if (!installation) throw createError({ status: 400, message: 'The app isn’t installed there. Install it first.' })
  // The repository must be reachable through that installation (also gives us its current name).
  const found = repo.safeParse(await asInstallation(config, installation.id, `/repositories/${input.repoId}`).catch(() => null))
  if (!found.success) throw createError({ status: 400, message: 'The app can’t reach that repository. Check the installation’s repository access on GitHub.' })
  const taken = await db
    .select({ key: schema.projects.key })
    .from(schema.projectGithub)
    .innerJoin(schema.projects, eq(schema.projectGithub.projectId, schema.projects.id))
    .where(and(eq(schema.projectGithub.repoId, input.repoId), ne(schema.projectGithub.projectId, project.id)))
  if (taken.length) throw createError({ status: 409, message: `${found.data.full_name} is already linked to ${taken[0]!.key}` })

  const current = await projectGithubLink(project.id)
  if (current && current.repoId !== input.repoId) {
    // A different repository: issue links from the old one no longer apply.
    await db.delete(schema.taskGithub).where(eq(schema.taskGithub.repoId, current.repoId))
  }
  const values = { installationId: installation.id, repoId: input.repoId, repoFullName: found.data.full_name, createIssues: input.createIssues, importIssues: input.importIssues, commentsFromGithub: input.commentsFromGithub, commentsToGithub: input.commentsToGithub }
  await db
    .insert(schema.projectGithub)
    .values({ projectId: project.id, createdBy: user.id, ...values })
    .onConflictDoUpdate({ target: schema.projectGithub.projectId, set: values })
  useLogger('github').info('project linked', { project: project.key, repo: found.data.full_name })
  return { ok: true, repoFullName: found.data.full_name }
})
