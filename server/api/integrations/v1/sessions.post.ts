/**
 * Server to server: `POST /api/integrations/v1/sessions` with the app's API key. Finds or creates the (external)
 * person, optionally opens a ticket for them, and returns a single-use login link valid for 5 minutes.
 * With `Idempotency-Key`, a retry with the same key and body gets the first answer back instead of a second ticket.
 */
export default defineEventHandler(async (event): Promise<IntegrationSessionResult> => {
  const app = await requireIntegrationApp(event)
  return withIdempotency(event, `app:${app.id}`, async () => {
    const input = await readValidatedBody(event, sessionInputShape.parse)
    return startIntegrationSession(event, app, input)
  })
})
