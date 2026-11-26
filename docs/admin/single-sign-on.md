# Set up single sign-on

This page shows admins how to let people sign in to Ticketer with an OpenID Connect (OIDC) identity provider, such as
Authentik, Keycloak, Microsoft Entra ID, Google Workspace or Zitadel. For a click-by-click Authentik walkthrough, see
[Single sign-on with Authentik](/admin/sso-authentik).

Ticketer uses the authorization code flow with PKCE (S256), `state` and `nonce`, and finds the provider's endpoints at
`<issuer>/.well-known/openid-configuration`. It verifies ID tokens signed with RS256, RS384, RS512, PS256, PS384,
PS512, ES256, ES384 or EdDSA (Ed25519) against the provider's keys, or with HS256, HS384 or HS512 using the client
secret.

## Before you begin

- You're signed in as an admin.
- Your provider's issuer URL. It must use `https://` (plain `http://` works only for `localhost`).
- Permission to create an application (a client) at the provider.

## Register Ticketer at your provider

1. In Ticketer, go to **Settings** > **Sign-in** and copy the **Callback URL**. It's your site's address followed by
   `/auth/oidc/callback`, for example `https://tickets.example.com/auth/oidc/callback`.
2. At your provider, create an OpenID Connect application:
   - Client type: confidential (with a client secret). A public client without a secret also works.
   - Redirect URI: the **Callback URL**.
   - Scopes: `openid`, `email` and `profile`, plus whatever your provider needs to include groups.
3. Note the issuer URL, the client ID and the client secret.

## Connect Ticketer

1. Go to **Settings** > **Sign-in**.
2. Enter the **Issuer URL** and select **Test connection**. Ticketer fetches the discovery document and key set and
   shows the endpoints it found. Fix any error before you continue.
3. Enter the **Client ID** and **Client secret**.
4. Optional: change the **Button label** (default `Single sign-on`) and the **Scopes** (default
   `openid email profile`).
5. Turn on **Enable single sign-on**.
6. Select **Save**.

The sign-in page now shows **Continue with** followed by the button label. Sign out, or use a private window, and try
it.

## Choose who gets in

Ticketer matches a person who signs in, in this order:

1. An account already linked to the same subject (`sub`) at this provider.
2. An account with the same email, if the provider says the email is verified (`email_verified` is `true`). Ticketer
   then links the two. If the email isn't verified, sign-in stops with the error `oidc_unverified_email`.
3. Otherwise, a new account. If the browser has a guest session, its tickets and chats move to the new account.

A new account gets the first role that applies:

1. The role from a [group mapping](#map-groups-to-roles).
2. The role of a pending invitation for that email, if the email is verified. The invitation is then used up.
3. Admin, if this is the first account on the deployment.
4. **Role for new people**: **External** (default), **Viewer**, **Member**, or **Nobody**.

With **Nobody**, only invited people and people in a mapped group can get in; everyone else sees "You do not have access
yet".

::: warning
**Role for new people** applies to everyone your provider lets through, whatever **Members** > **Who can sign up** says.
With **Viewer** or **Member**, anyone who can sign in at the provider joins your team. Restrict access at the provider,
or choose **Nobody** and use invitations or group mappings.
:::

## Map groups to roles

Group mappings give people a role based on their groups at the provider.

1. Go to **Settings** > **Sign-in**.
2. Under **Groups to roles**, select **Add mapping**, choose a role and enter the group name exactly as the provider
   sends it. Add one mapping per group.
3. In **Groups claim**, enter the claim that lists groups. The default is `groups`. Use a dotted path for nested
   claims, such as `realm_access.roles` for Keycloak realm roles.
4. Select **Save**.

How mappings apply:

- When at least one of a person's groups is mapped, the mapping decides their role at every sign-in, so group changes
  at the provider take effect. If several groups match, the most powerful role wins (admin, then member, viewer,
  external).
- People in no mapped group keep their current role.
- The last admin is never demoted by a mapping.

Ticketer reads groups from the ID token. If the ID token has no email or no groups claim, it also asks the provider's
userinfo endpoint.

## Turn on single sign-on only

With **Single sign-on only** on, the sign-in page shows only the single sign-on button, and password sign-up and
password reset are off.

1. Turn on **Enable single sign-on**, select **Save**, and test signing in with the provider.
2. Turn on **Single sign-on only** and select **Save**.

**Single sign-on only** can't be turned on until single sign-on is on and saved. Turning single sign-on off turns
**Single sign-on only** off too.

Admins keep password sign-in as a break-glass for when the provider is down: open `/auth/login?password`, or select
**Admin sign-in with a password** on the sign-in page. `NUXT_ADMIN_EMAIL` and `pnpm admin` also keep working.

### If nobody can get in

If the provider is down and no admin can sign in with a password, for example because the admin's password is
forgotten and password reset is off, set `NUXT_OIDC_ALLOW_PASSWORD=true` on the server and restart it, or redeploy on
Cloudflare. Password sign-in, sign-up and password reset then work for everyone, whatever **Single sign-on only**
says, and **Settings** > **Sign-in** shows a warning. Remove the variable once single sign-on works again.

## Configure it with environment variables

Every field can be pinned with an environment variable. A pinned field shows the variable's name in Settings and can't
be changed there. Fields you don't pin stay editable.

| Variable | Settings field | Default |
| --- | --- | --- |
| `NUXT_OIDC_ENABLED` | **Enable single sign-on** | `true` when `NUXT_OIDC_ISSUER` and `NUXT_OIDC_CLIENT_ID` are both set; otherwise the Settings switch, which is off |
| `NUXT_OIDC_ISSUER` | **Issuer URL** | None |
| `NUXT_OIDC_CLIENT_ID` | **Client ID** | None |
| `NUXT_OIDC_CLIENT_SECRET` | **Client secret** | None (public client) |
| `NUXT_OIDC_NAME` | **Button label** | `Single sign-on` |
| `NUXT_OIDC_SCOPES` | **Scopes** | `openid email profile` |
| `NUXT_OIDC_DEFAULT_ROLE` | **Role for new people** | `external`; also `viewer`, `member`, `none` |
| `NUXT_OIDC_GROUPS_CLAIM` | **Groups claim** | `groups` |
| `NUXT_OIDC_ROLE_GROUPS` | **Groups to roles** | None. Format: `admin:ticketer-admins,member:staff` |
| `NUXT_OIDC_ONLY` | **Single sign-on only** | `false` |
| `NUXT_OIDC_ALLOW_PASSWORD` | None: overrides **Single sign-on only** | `false`. See [If nobody can get in](#if-nobody-can-get-in). |
| `NUXT_OIDC_REDIRECT_URL` | None | `<origin>/auth/oidc/callback` |

Set `NUXT_OIDC_REDIRECT_URL` only when a proxy hides the public address from Ticketer. Ticketer builds the callback URL
from the request's host and the `X-Forwarded-Proto` header.

::: warning
A client secret entered in Settings is stored encrypted with a key derived from `NUXT_APP_SECRET`. If that secret
changes, Settings shows a problem and you have to enter the client secret again.
:::

## Notes for other providers

### Keycloak

- Issuer: `https://<keycloak-host>/realms/<realm>`.
- Create an OpenID Connect client with **Client authentication** on and **Standard flow** on, and add the callback URL
  to **Valid redirect URIs**.
- To map realm roles, set **Groups claim** to `realm_access.roles`, and make sure the realm roles mapper adds them to
  the ID token or to userinfo.

### Microsoft Entra ID

- Issuer: `https://login.microsoftonline.com/<tenant-id>/v2.0`. Use your tenant ID, not `common` or `organizations`;
  their discovery documents don't name a single issuer.
- Register a web application with the callback URL as a redirect URI, and create a client secret.
- Entra ID adds a `groups` claim only if you configure it under **Token configuration**, and then sends group object
  IDs, not names. Use the IDs in your mappings.
- Entra ID tokens don't include an `email_verified` claim. As a result, Ticketer doesn't link existing accounts with
  the same email (those people see `oidc_unverified_email`) and doesn't apply pending invitations. New accounts get
  their role from group mappings or **Role for new people**.

## What's next

- [Single sign-on with Authentik](/admin/sso-authentik)
- [Troubleshooting sign-in errors](/reference/troubleshooting#single-sign-on-errors)
- [Environment variables](/reference/environment-variables#single-sign-on)
