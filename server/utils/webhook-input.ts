import { z } from 'zod'

/** What an admin sets on a webhook (Settings → Webhooks). */
export const webhookInputShape = z.object({
  name: z.string().trim().min(1, 'Name the webhook').max(80),
  url: z.string().trim().max(2000).url('Enter the full address, starting with https://'),
  /** Event types, or ['*'] for all, including types added later. */
  events: z.array(z.union([z.literal('*'), z.enum(WEBHOOK_EVENTS)])).min(1, 'Choose at least one event'),
  includeNotes: z.boolean().default(false),
  includeEmails: z.boolean().default(false),
})

export async function checkWebhookUrl(url: string) {
  const problem = await webhookUrlProblem(url)
  if (problem) throw createError({ status: 400, message: problem })
}

export const webhookIdParams = z.object({ id: z.string().max(40) })
