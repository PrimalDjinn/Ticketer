/** One-time setup on the first request after start (works the same on Node and Workers, which have no boot hook). */
export default defineEventHandler(async () => {
  await ensureInitialAdmin()
})
