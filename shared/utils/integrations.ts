// Single sign-on and app integration values shared by the app and the server (auto-imported from `shared/utils`).

/** Where people sent by another app land when the request names no target. */
export const INTEGRATION_LANDINGS = ['new-ticket', 'chat', 'tickets'] as const
/** Targets a launch request may ask for (`ticket` needs a ticket id). */
export const INTEGRATION_TARGETS = ['new-ticket', 'chat', 'tickets', 'ticket'] as const
/** Role for people signing in with SSO for the first time; `none` = only invited or group-mapped people get in. */
export const OIDC_DEFAULT_ROLES = ['external', 'viewer', 'member', 'none'] as const

/** How long a login link from `POST /api/integrations/v1/sessions` stays valid. */
export const LOGIN_LINK_TTL_SECONDS = 5 * 60
/** Signed launch links: oldest accepted timestamp, and allowed clock skew into the future. */
export const LAUNCH_MAX_AGE_SECONDS = 5 * 60
export const LAUNCH_MAX_SKEW_SECONDS = 60

export const integrationLandingMeta: Record<(typeof INTEGRATION_LANDINGS)[number], { label: string; description: string; icon: string }> = {
  'new-ticket': { label: 'New ticket', description: 'The report form, prefilled with what the app sends', icon: 'i-lucide-file-plus' },
  chat: { label: 'Support chat', description: 'Opens a chat with the support team', icon: 'i-lucide-message-circle' },
  tickets: { label: 'My tickets', description: 'The list of their tickets', icon: 'i-lucide-list' },
}

/**
 * The string a launch link signs: every query parameter except `sig`, sorted by name, each written as
 * `name=value` with both parts percent-encoded per RFC 3986 (only A-Z a-z 0-9 - _ . ~ left as is), joined with `&`.
 */
export function canonicalLaunchString(params: Iterable<[string, string]>) {
  return [...params]
    .filter(([key]) => key !== 'sig')
    .map(([key, value]) => [rfc3986(key), rfc3986(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
}

/** `encodeURIComponent` plus the five characters it leaves alone but RFC 3986 reserves. */
export function rfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}
