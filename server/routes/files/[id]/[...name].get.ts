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
  const { id } = await getValidatedRouterParams(event, params.parse)
  const { download } = await getValidatedQuery(event, query.parse)
  const file = await db.query.attachments.findFirst({ where: eq(schema.attachments.id, id) })
  if (!file) throw notFound()

  // Anonymous visitors may download files of public tickets (and of their public replies); everything else needs a
  // session. Roles are re-read from the database so a demotion applies at once.
  const user = await optionalTicketViewer(event)
  if (file.ticketId) {
    await loadTicketFor(user, file.ticketId).catch(() => {
      throw notFound()
    })
  } else if (file.commentId) {
    const comment = await db.query.comments.findFirst({ where: eq(schema.comments.id, file.commentId), columns: { ticketId: true } })
    if (!comment) throw notFound()
    const ticket = await loadTicketFor(user, comment.ticketId).catch(() => {
      throw notFound()
    })
    // Internal notes (and anything under one) are for the team only.
    if (!isInternal(user)) {
      const thread = await db
        .select({ id: schema.comments.id, parentId: schema.comments.parentId, internal: schema.comments.internal })
        .from(schema.comments)
        .where(eq(schema.comments.ticketId, ticket.id))
      if (!visibleComments(thread).some((c) => c.id === file.commentId)) throw notFound()
    }
  } else if (file.conversationMessageId) {
    if (!user) throw notFound()
    if (!isInternal(user)) {
      const [row] = await db
        .select({ customerId: schema.conversations.customerId, internal: schema.conversationMessages.internal })
        .from(schema.conversationMessages)
        .innerJoin(schema.conversations, eq(schema.conversationMessages.conversationId, schema.conversations.id))
        .where(eq(schema.conversationMessages.id, file.conversationMessageId))
      if (!row || row.internal || row.customerId !== user.id) throw notFound()
    }
  } else if (file.taskId || file.taskCommentId) {
    if (!isInternal(user)) throw notFound()
  } else if (file.messageId) {
    if (!user) throw notFound()
    const message = await db.query.messages.findFirst({ where: eq(schema.messages.id, file.messageId) })
    if (!message || (message.fromId !== user.id && message.toId !== user.id)) throw notFound()
  } else {
    throw notFound()
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

function notFound() {
  return createError({ status: 404, message: 'File not found' })
}
