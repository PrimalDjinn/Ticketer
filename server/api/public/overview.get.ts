/** What the public pages show: the team's typical reply time and the current public issues. No account needed. */
export default defineCachedEventHandler(
  async (): Promise<PublicOverview> => {
    const [reply, status] = await Promise.all([replyTime(), publicStatus()])
    return { reply, status }
  },
  { maxAge: 60, swr: true, name: 'public-overview', getKey: () => 'all' },
)
