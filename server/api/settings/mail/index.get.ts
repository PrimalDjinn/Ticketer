/** Settings → Email: the effective setup and where each part comes from. The SMTP password is never returned. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const config = await mailConfig(event)
  return {
    platform: onCloudflare(event) ? ('cloudflare' as const) : ('node' as const),
    transport: config.transport,
    from: { value: config.from, source: config.fromSource },
    smtp: {
      source: config.smtpSource,
      host: config.settings.host,
      port: config.settings.port,
      security: config.settings.security,
      user: config.settings.user,
      passwordSet: !!config.settings.password,
    },
  }
})
