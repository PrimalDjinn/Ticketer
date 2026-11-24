/** Stop following a task. Assignees can unfollow too; they still get "assigned you" and due-date reminders. */
export default defineEventHandler(async (event) => {
  const user = await requireInternal(event)
  const { id } = await getValidatedRouterParams(event, taskParams.parse)
  await loadTask(id)
  await unfollowTask(event, id, user.id)
  return { followers: await taskFollowers(id) }
})
