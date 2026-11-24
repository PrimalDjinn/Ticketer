import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const fields = z.object({
  body: z.string().trim().max(10_000).default(''),
  parentId: z.coerce.number().int().positive().optional(),
  mentions: z.array(z.string().max(64)).max(50).default([]),
})

export default defineEventHandler(async (event) => {
  const user = await requireEditor(event)
  const { id } = await getValidatedRouterParams(event, taskParams.parse)
  const task = await loadTask(id)
  const { files, text, form } = await readMultipart(event)
  const input = fields.parse({ body: text('body'), parentId: text('parentId') || undefined, mentions: form.getAll('mentions') })
  if (!input.body && !files.length) throw createError({ status: 400, message: 'Write a comment or attach a document' })
  if (input.parentId) {
    const parent = await db.query.taskComments.findFirst({ where: and(eq(schema.taskComments.id, input.parentId), eq(schema.taskComments.taskId, id)) })
    if (!parent) throw createError({ status: 400, message: 'The comment you replied to no longer exists' })
  }

  const [comment] = await db.insert(schema.taskComments).values({ taskId: id, parentId: input.parentId ?? null, authorId: user.id, body: input.body }).returning()
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, task.projectId) })
  try {
    await storeAttachments(`projects/${project!.key}/${task.number}/comments/${comment!.id}`, files, { taskCommentId: comment!.id }, user.id)
  } catch (error) {
    await db.delete(schema.taskComments).where(eq(schema.taskComments.id, comment!.id))
    throw error
  }

  const [dto] = await toTaskCommentDTOs([comment!])
  publishTask(event, { type: 'task.comment.created', body: { ...dto!, taskId: id } })

  const ref = `${project!.key}-${task.number}`
  const link = `/projects/${project!.key}/${task.number}#comment-${comment!.id}`
  const people = new Set((await members()).map((m) => m.id))
  const mentioned = input.mentions.filter((uid) => people.has(uid) && uid !== user.id)
  await notify(event, mentioned, { type: 'mention', message: `${user.name} mentioned you on ${ref}`, link })
  // Followers (the assignee and creator among them) hear about the comment; people just mentioned already did.
  await notifyTaskFollowers(event, id, user.id, { type: 'comment', message: `${user.name} commented on ${ref}: ${task.title}`, link }, mentioned)
  await followTask(event, id, [user.id])
  return dto
})
