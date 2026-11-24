import { asc, eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Everything the board and list views need in one request. */
export default defineEventHandler(async (event): Promise<ProjectBoardDTO> => {
  await requireInternal(event)
  const { key } = await getValidatedRouterParams(event, projectKeyParams.parse)
  const project = await loadProject(key)
  const rows = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.projectId, project.id))
    .orderBy(asc(schema.tasks.position), asc(schema.tasks.id))
  const [[dto], tasks, labels, people] = await Promise.all([toProjectDTOs([project]), toTaskDTOs(rows), allLabels(), members()])
  return { project: dto!, tasks, labels, members: people }
})
