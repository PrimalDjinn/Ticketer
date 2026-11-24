export default defineEventHandler(async (event) => {
  await requireInternal(event)
  const { id } = await getValidatedRouterParams(event, taskParams.parse)
  return taskDetail(await loadTask(id))
})
