/**
 * What the public pages show: the team's typical reply time and the current public issues. No account needed.
 * The status is read fresh so a newly published issue shows up at once; only the reply time (a 30-day median) is cached.
 */
const cachedReplyTime = defineCachedFunction(() => replyTime(), { maxAge: 600, swr: true, name: 'public-reply-time', getKey: () => 'all' })

export default defineEventHandler(async (): Promise<PublicOverview> => {
  const [reply, status] = await Promise.all([cachedReplyTime(), publicStatus()])
  return { reply, status }
})
