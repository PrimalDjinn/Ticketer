import { z } from 'zod'

const body = z.object({
  from: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !v || /^(?:[^<>]*<)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/.test(v), 'Use an address like Ticketer <support@example.com>'),
  host: z.string().trim().max(253).regex(/^[a-zA-Z0-9.-]*$/, 'Enter a host name such as smtp.example.com'),
  port: z.number().int().min(1).max(65535),
  security: z.enum(['tls', 'starttls', 'none']),
  user: z.string().trim().max(320),
  /** Omitted = keep the stored password; null or '' = remove it. */
  password: z.string().max(2000).nullable().optional(),
})

/** Saves Settings → Email. Values pinned by environment variables cannot be changed here. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const input = await readValidatedBody(event, body.parse)
  const env = useRuntimeConfig(event).mail
  const current = (await getSetting('mail', mailSettingsShape)) ?? mailSettingsShape.parse({})

  const password = input.password === undefined ? current.password : input.password ? await encryptSecret(input.password) : null
  await setSetting('mail', {
    // Keep stored values for parts the environment controls, so removing the env var later restores them.
    from: env.from ? current.from : input.from,
    host: env.smtpUrl ? current.host : input.host,
    port: env.smtpUrl ? current.port : input.port,
    security: env.smtpUrl ? current.security : input.security,
    user: env.smtpUrl ? current.user : input.user,
    password: env.smtpUrl ? current.password : password,
  } satisfies MailSettings)
  useLogger('settings').info('mail settings saved', { host: input.host, port: input.port, security: input.security })
  return { ok: true }
})
