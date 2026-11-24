import { z } from 'zod'

const query = z.object({ return: z.string().regex(/^\/[\w\-/]*$/).max(200).optional() })

/** Where to send someone to install the app on (more) GitHub accounts; they come back to `return`. */
export default defineEventHandler(async (event) => {
  const user = await requireStaff(event)
  const { return: back } = await getValidatedQuery(event, query.parse)
  const config = await requireGithubConfig(event)
  const state = await signState(`install:${user.id}:${back ?? '/settings/github'}`)
  return { url: `${config.webUrl}/apps/${config.slug}/installations/new?state=${encodeURIComponent(state)}` }
})
