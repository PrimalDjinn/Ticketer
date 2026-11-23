export default defineEventHandler(async (event) => {
  await requireMember(event)
  const { id } = await getValidatedRouterParams(event, taskParams.parse)
  return taskDetail(await loadTask(id))
})
