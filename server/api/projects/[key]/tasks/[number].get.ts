import { and, eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  await requireInternal(event)
  const { key, number } = await getValidatedRouterParams(event, projectTaskParams.parse)
  const project = await loadProject(key)
  const task = await db.query.tasks.findFirst({ where: and(eq(schema.tasks.projectId, project.id), eq(schema.tasks.number, number)) })
  if (!task) throw createError({ status: 404, message: `${key}-${number} does not exist` })
  return taskDetail(task)
})
