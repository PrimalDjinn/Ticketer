import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({ projectKey: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/) })

/** Support -> engineering hand-off: a task linked to the ticket, carrying its text and reference. */
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const { projectKey } = await readValidatedBody(event, body.parse)
  const ticket = await loadTicketFor(staff, id)
  const project = await loadProject(projectKey)

  // One task per ticket: a second hand-off would only duplicate the work.
  const [existing] = await db
    .select({ number: schema.tasks.number, key: schema.projects.key })
    .from(schema.tasks)
    .innerJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
    .where(eq(schema.tasks.ticketId, ticket.id))
    .limit(1)
  if (existing) throw createError({ statusCode: 409, statusMessage: `This ticket already has task ${existing.key}-${existing.number}` })

  const title = ticketTitle(ticket).slice(0, 120)
  const description = `${ticket.info}\n\n— From support ticket #${ticket.reference.slice(-8)}`
  const priority = ticket.urgency === 'Emergency' ? 'urgent' : ticket.urgency === 'Urgent' ? 'high' : 'none'
  const task = await createTask(event, staff, project, { title, description, ticketId: ticket.id, priority })
  return { ...task, projectKey: project.key }
})
