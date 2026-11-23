import { and, asc, eq, inArray, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({
  statuses: z
    .array(
      z.object({
        id: z.number().int().positive().optional(),
        name: z.string().trim().min(1).max(40),
        color: z.enum(PALETTE).default('neutral'),
        isDone: z.boolean().default(false),
      }),
    )
    .min(1, 'Keep at least one column')
    .max(12),
})

/**
 * Replaces the workflow in one go (the settings dialog edits the whole list). Columns left out are removed and their
 * tasks move to the first remaining column.
 */
export default defineEventHandler(async (event) => {
  await requireEditor(event)
  const { key } = await getValidatedRouterParams(event, projectKeyParams.parse)
  const { statuses } = await readValidatedBody(event, body.parse)
  const project = await loadProject(key)
  const existing = await db.select().from(schema.projectStatuses).where(eq(schema.projectStatuses.projectId, project.id))
  const ownIds = new Set(existing.map((s) => s.id))
  if (statuses.some((s) => s.id && !ownIds.has(s.id))) throw createError({ status: 400, message: 'Unknown column' })

  const keptIds: number[] = []
  for (const [position, s] of statuses.entries()) {
    if (s.id) {
      await db.update(schema.projectStatuses).set({ name: s.name, color: s.color, isDone: s.isDone, position }).where(eq(schema.projectStatuses.id, s.id))
      keptIds.push(s.id)
    } else {
      const [row] = await db.insert(schema.projectStatuses).values({ projectId: project.id, name: s.name, color: s.color, isDone: s.isDone, position }).returning()
      keptIds.push(row!.id)
    }
  }

  const removed = existing.filter((s) => !keptIds.includes(s.id)).map((s) => s.id)
  if (removed.length) {
    await db.update(schema.tasks).set({ statusId: keptIds[0]!, updatedAt: new Date() }).where(inArray(schema.tasks.statusId, removed))
    await db.delete(schema.projectStatuses).where(and(eq(schema.projectStatuses.projectId, project.id), notInArray(schema.projectStatuses.id, keptIds)))
  }

  await publishProject(event, project.id)
  return (await db.select().from(schema.projectStatuses).where(eq(schema.projectStatuses.projectId, project.id)).orderBy(asc(schema.projectStatuses.position))).map(toStatusDTO)
})
