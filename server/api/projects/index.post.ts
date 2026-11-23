import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({
  name: z.string().trim().min(1, 'Name the project').max(80),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Use 2-10 letters or digits, starting with a letter')
    .optional(),
  description: z.string().trim().max(2000).default(''),
  color: z.enum(PALETTE).default('indigo'),
})

/** Derives a short key from the name: "Customer Support" -> "CS", "Billing" -> "BIL". */
function deriveKey(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  const key = words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 4) : (words[0] ?? 'PRJ').slice(0, 3)
  return /^[A-Z]/.test(key) && key.length >= 2 ? key : `P${key}`.slice(0, 4).padEnd(2, 'X')
}

export default defineEventHandler(async (event) => {
  const user = await requireEditor(event)
  const input = await readValidatedBody(event, body.parse)

  let key = input.key ?? deriveKey(input.name)
  if (await db.query.projects.findFirst({ where: eq(schema.projects.key, key), columns: { id: true } })) {
    if (input.key) throw createError({ status: 409, message: `The key ${key} is already used` })
    for (let n = 2; ; n++) {
      const candidate = `${key.slice(0, 8)}${n}`
      if (!(await db.query.projects.findFirst({ where: eq(schema.projects.key, candidate), columns: { id: true } }))) {
        key = candidate
        break
      }
    }
  }

  const [project] = await db
    .insert(schema.projects)
    .values({ key, name: input.name, description: input.description, color: input.color, createdById: user.id })
    .returning()
  await db.insert(schema.projectStatuses).values(DEFAULT_WORKFLOW.map((s, position) => ({ projectId: project!.id, position, ...s })))

  await publishProject(event, project!.id)
  const [dto] = await toProjectDTOs([project!])
  return dto
})
