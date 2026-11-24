/** People who can be assigned or mentioned on tasks. */
export default defineEventHandler(async (event) => {
  await requireInternal(event)
  return members()
})
