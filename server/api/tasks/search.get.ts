import { and, desc, eq, like, or } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const query = z.object({
  q: z.string().trim().max(100).default(''),
  exclude: z.coerce.number().int().positive().optional(),
})

/** Task picker for relations: matches "KEY-12", a number, or words in the title, across projects. */
export default defineEventHandler(async (event) => {
  await requireMember(event)
  const { q, exclude } = await getValidatedQuery(event, query.parse)
  const ref = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d+)$/.exec(q)
  const term = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`
  const rows = await db
    .select({ id: schema.tasks.id, number: schema.tasks.number, title: schema.tasks.title, key: schema.projects.key })
    .from(schema.tasks)
    .innerJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
    .where(
      ref
        ? and(eq(schema.projects.key, ref[1]!.toUpperCase()), eq(schema.tasks.number, Number(ref[2])))
        : q
          ? or(like(schema.tasks.title, term), /^\d+$/.test(q) ? eq(schema.tasks.number, Number(q)) : undefined)
          : undefined,
    )
    .orderBy(desc(schema.tasks.updatedAt), desc(schema.tasks.id))
    .limit(20)
  return rows.filter((r) => r.id !== exclude).map((r) => ({ id: r.id, ref: `${r.key}-${r.number}`, title: r.title, projectKey: r.key, number: r.number }))
})
