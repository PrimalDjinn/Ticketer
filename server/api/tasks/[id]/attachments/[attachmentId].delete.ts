import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const params = z.object({ id: z.coerce.number().int().positive(), attachmentId: z.coerce.number().int().positive() })

export default defineEventHandler(async (event) => {
  const user = await requireEditor(event)
  const { id, attachmentId } = await getValidatedRouterParams(event, params.parse)
  const [row] = await db
    .delete(schema.attachments)
    .where(and(eq(schema.attachments.id, attachmentId), eq(schema.attachments.taskId, id)))
    .returning()
  if (!row) throw createError({ status: 404, message: 'File not found' })
  event.waitUntil(deleteBlobs([row.pathname]))
  await recordActivity(id, user.id, [{ field: 'attachment', from: row.name }])
  publishTask(event, { type: 'task.updated', body: await taskDTO(id) })
  return { ok: true }
})
