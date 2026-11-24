/** Creates the GitHub issue for a task that doesn't have one yet (or re-syncs it). */
export default defineEventHandler(async (event) => {
  await requireEditor(event)
  const { id } = await getValidatedRouterParams(event, taskParams.parse)
  const task = await loadTask(id)
  if (!(await projectGithubLink(task.projectId))) throw createError({ status: 400, message: 'This project isn’t linked to a GitHub repository' })
  await requireGithubConfig(event)
  try {
    await pushTaskNow(event, id, { force: true })
  } catch (error) {
    throw createError({ status: 502, message: error instanceof Error ? error.message : 'GitHub refused the change' })
  }
  return taskDTO(id)
})
