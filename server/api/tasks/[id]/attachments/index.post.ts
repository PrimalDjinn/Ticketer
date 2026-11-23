import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const user = await requireEditor(event)
  const { id } = await getValidatedRouterParams(event, taskParams.parse)
  const task = await loadTask(id)
  const { files } = await readMultipart(event)
  if (!files.length) throw createError({ status: 400, message: 'Choose at least one file' })
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, task.projectId) })
  const rows = await storeAttachments(`projects/${project!.key}/${task.number}`, files, { taskId: id }, user.id)
  await recordActivity(id, user.id, rows.map((r) => ({ field: 'attachment', to: r.name })))
  publishTask(event, { type: 'task.updated', body: await taskDTO(id) })
  return rows.map(toAttachmentDTO)
})
