import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Unlinks the repository. Tasks and issues both stay; they just stop syncing. */
export default defineEventHandler(async (event) => {
  await requireEditor(event)
  const { key } = await getValidatedRouterParams(event, projectKeyParams.parse)
  const project = await loadProject(key)
  const link = await projectGithubLink(project.id)
  if (link) {
    await db.delete(schema.taskGithub).where(eq(schema.taskGithub.repoId, link.repoId))
    await db.delete(schema.projectGithub).where(eq(schema.projectGithub.projectId, project.id))
  }
  return { ok: true }
})
