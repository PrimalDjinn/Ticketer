/** Every minute: retries webhook deliveries that are due (utils/webhooks.ts). See utils/jobs.ts. */
export default defineTask({
  meta: { name: 'webhooks:deliver', description: 'Retry webhook deliveries that are due' },
  async run({ context }) {
    return { result: await runJobRoute(context, '/_jobs/webhooks', await knownSiteOrigin()) }
  },
})
