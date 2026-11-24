import { and, asc, eq, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({
  fields: z
    .array(
      z
        .object({
          id: z.number().int().positive().optional(),
          name: z.string().trim().min(1).max(40),
          type: z.enum(FIELD_TYPES),
          options: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
          required: z.boolean().default(false),
        })
        .refine((f) => !['select', 'multiselect'].includes(f.type) || f.options.length > 0, { message: 'Add at least one choice', path: ['options'] }),
    )
    .max(20),
})

/** Replaces the project's custom fields (the settings dialog edits the whole list). Removed fields lose their values. */
export default defineEventHandler(async (event) => {
  await requireEditor(event)
  const { key } = await getValidatedRouterParams(event, projectKeyParams.parse)
  const { fields } = await readValidatedBody(event, body.parse)
  const project = await loadProject(key)
  const existing = await db.select().from(schema.projectFields).where(eq(schema.projectFields.projectId, project.id))
  const own = new Map(existing.map((f) => [f.id, f]))
  if (fields.some((f) => f.id && !own.has(f.id))) throw createError({ status: 400, message: 'Unknown field' })
  if (fields.some((f) => f.id && own.get(f.id)!.type !== f.type)) {
    throw createError({ status: 400, message: 'A field cannot change type; remove it and add a new one' })
  }

  const kept: number[] = []
  for (const [position, f] of fields.entries()) {
    const values = { name: f.name, type: f.type, options: ['select', 'multiselect'].includes(f.type) ? [...new Set(f.options)] : [], required: f.required, position }
    if (f.id) {
      await db.update(schema.projectFields).set(values).where(eq(schema.projectFields.id, f.id))
      kept.push(f.id)
    } else {
      const [row] = await db.insert(schema.projectFields).values({ projectId: project.id, ...values }).returning()
      kept.push(row!.id)
    }
  }
  await db
    .delete(schema.projectFields)
    .where(and(eq(schema.projectFields.projectId, project.id), kept.length ? notInArray(schema.projectFields.id, kept) : undefined))

  await publishProject(event, project.id)
  return (await db.select().from(schema.projectFields).where(eq(schema.projectFields.projectId, project.id)).orderBy(asc(schema.projectFields.position))).map(toFieldDTO)
})
