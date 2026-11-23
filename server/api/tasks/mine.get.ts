import { and, asc, eq, inArray } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Open tasks assigned to the signed-in person, across projects. */
export default defineEventHandler(async (event) => {
  const user = await requireMember(event)
  const rows = await db
    .select({ task: schema.tasks })
    .from(schema.tasks)
    .innerJoin(schema.projectStatuses, eq(schema.tasks.statusId, schema.projectStatuses.id))
    .where(and(eq(schema.tasks.assigneeId, user.id), eq(schema.projectStatuses.isDone, false)))
    .orderBy(asc(schema.tasks.dueDate), asc(schema.tasks.id))
  const tasks = await toTaskDTOs(rows.map((r) => r.task))
  const projectIds = [...new Set(tasks.map((t) => t.projectId))]
  const projects = projectIds.length ? await toProjectDTOs(await db.select().from(schema.projects).where(inArray(schema.projects.id, projectIds))) : []
  return { tasks, projects, labels: await allLabels() }
})
