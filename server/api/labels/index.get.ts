export default defineEventHandler(async (event) => {
  await requireMember(event)
  return allLabels()
})
