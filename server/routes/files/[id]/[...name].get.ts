import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { blob } from 'hub:blob'
import { db, schema } from 'hub:db'

const params = z.object({ id: z.coerce.number().int().positive(), name: z.string().optional() })
const query = z.object({ download: z.stringbool().optional() })

// Types a browser may render inline. Everything else downloads, so an uploaded HTML/SVG file can never run script
// on this origin.
const INLINE = /^(image\/(png|jpe?g|gif|webp|avif)|application\/pdf|video\/(mp4|webm|ogg)|audio\/(mpeg|ogg|wav|webm|mp4)|text\/plain)$/

/**
 * Serves an attachment after checking the viewer may see what it is attached to. Blobs are never public: R2 and the
 * filesystem are only reachable through this route.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, params.parse)
  const { download } = await getValidatedQuery(event, query.parse)
  const file = await db.query.attachments.findFirst({ where: eq(schema.attachments.id, id) })
  if (!file) throw createError({ status: 404, message: 'File not found' })

  if (file.ticketId) {
    await loadTicketFor(user, file.ticketId)
  } else if (file.commentId) {
    const comment = await db.query.comments.findFirst({ where: eq(schema.comments.id, file.commentId), columns: { ticketId: true } })
    if (!comment) throw createError({ status: 404, message: 'File not found' })
    await loadTicketFor(user, comment.ticketId)
  } else if (file.taskId || file.taskCommentId) {
    if (user.isGuest) throw createError({ status: 404, message: 'File not found' })
  } else if (file.messageId) {
    const message = await db.query.messages.findFirst({ where: eq(schema.messages.id, file.messageId) })
    if (!message || (message.fromId !== user.id && message.toId !== user.id)) throw createError({ status: 404, message: 'File not found' })
  }

  const inline = !download && INLINE.test(file.contentType)
  setHeaders(event, {
    'content-type': file.contentType,
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, max-age=3600',
  })
  return blob.serve(event, file.pathname)
})
