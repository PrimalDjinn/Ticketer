/** Follow a task: notifications for its comments, status changes and reassignment. */
export default defineEventHandler(async (event) => {
  const user = await requireInternal(event)
  const { id } = await getValidatedRouterParams(event, taskParams.parse)
  await loadTask(id)
  await followTask(event, id, [user.id])
  return { followers: await taskFollowers(id) }
})
