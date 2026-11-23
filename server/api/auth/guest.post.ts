/** Starts (or resumes) an anonymous session so visitors can open tickets and chat with support. */
export default defineEventHandler(async (event) => {
  return ensureUser(event)
})
