/**
 * Hourly (see `scheduledTasks` in nuxt.config.ts and `triggers.crons` in wrangler.jsonc): sends due-date reminders when
 * it's the hour chosen in Settings → Reminders, and tidies old events and deliveries. See utils/jobs.ts.
 */
export default defineTask({
  meta: { name: 'reminders:due', description: 'Remind people about tasks due today and tomorrow' },
  async run({ context }) {
    const origin = await knownSiteOrigin()
    if (!origin) {
      useLogger('reminders').info('skipped: the site address is not known yet; it is learned when someone in the team opens Ticketer, or set NUXT_SITE_URL')
      return { result: 'skipped' }
    }
    return { result: await runJobRoute(context, '/_jobs/due-reminders', origin) }
  },
})
