export default defineEventHandler(async (event) => {
  await requireInternal(event)
  return allLabels()
})
