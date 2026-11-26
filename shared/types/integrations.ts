// Single sign-on and app integrations (auto-imported from `shared/types`).
import type { INTEGRATION_LANDINGS, INTEGRATION_TARGETS, OIDC_DEFAULT_ROLES } from '../utils/integrations'

/** What the sign-in and sign-up pages may offer. */
export interface AuthProviders {
  /** Password sign-in, sign-up and reset are offered (false in SSO-only mode). */
  password: boolean
  oidc: { name: string } | null
}

export type OidcDefaultRole = (typeof OIDC_DEFAULT_ROLES)[number]

/** Where a value comes from: `env` values are pinned by the deployment and read-only in Settings. */
export type ConfigSource = 'env' | 'settings' | 'unset'
export interface ConfigField<T> {
  value: T
  source: ConfigSource
}

/** Settings → Sign-in. The client secret is never sent back. */
export interface OidcSettingsDTO {
  enabled: ConfigField<boolean>
  issuer: ConfigField<string>
  clientId: ConfigField<string>
  clientSecret: { set: boolean; source: ConfigSource }
  name: ConfigField<string>
  scopes: ConfigField<string>
  defaultRole: ConfigField<OidcDefaultRole>
  groupsClaim: ConfigField<string>
  /** `admin:group-a,member:group-b` */
  roleGroups: ConfigField<string>
  only: ConfigField<boolean>
  /** The redirect URI to register at the identity provider. */
  callbackUrl: string
  /** Enabled and complete: the button shows on the sign-in page. */
  active: boolean
  /** Why it is not active, when enabled but incomplete. */
  problem: string | null
  /** NUXT_OIDC_ALLOW_PASSWORD is set: passwords keep working even with "Single sign-on only". */
  passwordOverride: boolean
}

export interface OidcTestResult {
  ok: boolean
  message: string
  issuer?: string
  endpoints?: { authorization: string; token: string; userinfo: string | null; jwks: string }
  pkce?: boolean
  signingAlgs?: string[]
}

export type IntegrationLanding = (typeof INTEGRATION_LANDINGS)[number]
export type IntegrationTarget = (typeof INTEGRATION_TARGETS)[number]

export interface IntegrationAppDTO {
  id: string
  name: string
  allowedOrigins: string[]
  landing: IntegrationLanding
  canProvision: boolean
  /** May erase people it brought here (DELETE /api/integrations/v1/users). */
  canDelete: boolean
  enabled: boolean
  keyPrefix: string
  createdBy: string | null
  createdAt: string | number | Date
  rotatedAt: string | number | Date | null
  lastUsedAt: string | number | Date | null
  apiCalls: number
  signIns: number
  ticketsCreated: number
  /** Accounts the app has linked (people it created or recognised by external id). */
  people: number
}

/** Returned once, on create and on rotate. */
export interface IntegrationAppCredentials {
  app: IntegrationAppDTO
  apiKey: string
  signingSecret: string
}

/** `GET /api/integrations/v1/tickets` item. */
export interface IntegrationTicketDTO {
  id: number
  reference: string
  title: string
  status: string
  urgency: string
  visibility: 'private' | 'public'
  createdAt: string | number | Date
  updatedAt: string | number | Date | null
  /** Opens the ticket (the person must be signed in, e.g. through a login link). */
  url: string
  /** Anyone can open it without an account (public tickets only). */
  publicUrl: string | null
}

export interface IntegrationSessionResult {
  url: string
  expiresAt: string | number | Date
  userId: string
  /** True when the account was created by this call. */
  created: boolean
  ticket?: { id: number; reference: string; url: string }
}
