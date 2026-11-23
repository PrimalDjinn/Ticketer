import { z } from 'zod'

const body = z.object({ projectKey: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/) })

/** Support -> engineering hand-off: a task linked to the ticket, carrying its text and reference. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const { projectKey } = await readValidatedBody(event, body.parse)
  const ticket = await loadTicketFor(admin, id)
  const project = await loadProject(projectKey)

  const title = ticket.info.split('\n')[0]!.slice(0, 120)
  const description = `${ticket.info}\n\n— From support ticket #${ticket.reference.slice(-8)}`
  const priority = ticket.urgency === 'Emergency' ? 'urgent' : ticket.urgency === 'Urgent' ? 'high' : 'none'
  const task = await createTask(event, admin, project, { title, description, ticketId: ticket.id, priority })
  return { ...task, projectKey: project.key }
})
