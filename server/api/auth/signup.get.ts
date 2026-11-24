import { z } from 'zod'

const query = z.object({ invite: z.string().trim().min(16).max(128).optional() })

/** Tells the sign-up page whether it may show the form, and for which invitation. */
export default defineEventHandler(async (event): Promise<SignupInfo> => {
  const { invite: token } = await getValidatedQuery(event, query.parse)
  const [firstAccount, mode, found] = await Promise.all([isFirstAccount(), getSignupMode(), token ? findInvite(token) : null])
  return {
    firstAccount,
    mode,
    invite: found?.ok ? { email: found.invite.email, role: found.invite.role, invitedBy: found.invitedBy } : null,
    inviteError: found && !found.ok ? found.error : null,
  }
})
