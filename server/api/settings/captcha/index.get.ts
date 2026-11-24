/** Settings → Bot protection. The secret key is never sent back, only whether one is set. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const config = await captchaConfig(event)
  return {
    provider: config.provider,
    siteKey: config.siteKey,
    secretKeySet: !!config.secretKey,
    sources: config.sources,
    problem: config.problem,
    active: config.provider !== 'none' && !config.problem,
  }
})
