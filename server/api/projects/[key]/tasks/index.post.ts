import { z } from 'zod'

export const newTaskSchema = z.object({
  title: z.string().trim().min(1, 'Give the task a title').max(300),
  description: z.string().max(20_000).default(''),
  statusId: z.number().int().positive().optional(),
  priority: z.enum(TASK_PRIORITIES).default('none'),
  assigneeId: z.string().max(64).nullable().optional(),
  startDate: z.iso.date().nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
  labelIds: z.array(z.number().int().positive()).max(20).default([]),
  parentId: z.number().int().positive().nullable().optional(),
  ticketId: z.number().int().positive().nullable().optional(),
  repeat: z.enum(TASK_REPEATS).nullable().optional(),
  repeatInterval: z.number().int().min(1).max(3650).nullable().optional(),
  fields: z.record(z.string().regex(/^\d+$/), z.unknown()).optional(),
  requireFields: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireEditor(event)
  const { key } = await getValidatedRouterParams(event, projectKeyParams.parse)
  const input = await readValidatedBody(event, newTaskSchema.parse)
  return createTask(event, user, await loadProject(key), input)
})
