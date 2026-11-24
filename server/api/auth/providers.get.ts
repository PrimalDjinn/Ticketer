/** What the sign-in and sign-up pages offer: password and/or single sign-on. Public. */
export default defineEventHandler(async (event): Promise<AuthProviders> => {
  const config = await oidcConfig(event)
  return {
    password: !config.only,
    oidc: config.active ? { name: config.name } : null,
  }
})
