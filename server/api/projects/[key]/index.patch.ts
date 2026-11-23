import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(2000).optional(),
  color: z.enum(PALETTE).optional(),
  archived: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  await requireEditor(event)
  const { key } = await getValidatedRouterParams(event, projectKeyParams.parse)
  const { archived, ...input } = await readValidatedBody(event, body.parse)
  const project = await loadProject(key)
  await db
    .update(schema.projects)
    .set({ ...input, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) })
    .where(eq(schema.projects.id, project.id))
  await publishProject(event, project.id)
  const [dto] = await toProjectDTOs([(await loadProject(key))])
  return dto
})
