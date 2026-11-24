# Set up single sign-on with Authentik

This page walks Ticketer admins through connecting Ticketer to [Authentik](https://goauthentik.io), including mapping
Authentik groups to Ticketer roles. For the general rules, such as how accounts are matched, see
[Set up single sign-on](/admin/single-sign-on).

## Before you begin

- An Authentik instance reachable over `https://`, and an Authentik admin account.
- A Ticketer admin account.
- Your Ticketer **Callback URL**. In Ticketer, go to **Settings** > **Sign-in** and copy it. It looks like
  `https://tickets.example.com/auth/oidc/callback`.

## Create the provider and application in Authentik

1. In the Authentik admin interface, go to **Applications** > **Applications** and select **Create with provider**
   (**Create with Wizard** in older versions).
2. Application details:
   - **Name**: `Ticketer`.
   - **Slug**: `ticketer`. The slug becomes part of the issuer URL.
3. Provider type: **OAuth2/OpenID Provider**.
4. Provider settings:
   - **Authorization flow**: `default-provider-authorization-implicit-consent` skips the consent screen;
     `default-provider-authorization-explicit-consent` shows it.
   - **Client type**: **Confidential**.
   - **Redirect URIs**: add the Ticketer **Callback URL** with matching mode **Strict**.
   - **Signing Key**: choose a certificate, such as `authentik Self-signed Certificate`. Ticketer then verifies RS256
     tokens with Authentik's keys. If you leave it empty, Authentik signs with HS256 and the client secret, which
     Ticketer also accepts.
5. Copy the **Client ID** and **Client Secret**.
6. Finish the wizard. Optional: bind the application to a group or policy to limit who can use it.
7. Open the new provider and copy the **OpenID Configuration Issuer**. It looks like
   `https://auth.example.com/application/o/ticketer/`.

## Connect Ticketer

1. In Ticketer, go to **Settings** > **Sign-in**.
2. In **Issuer URL**, paste the OpenID Configuration Issuer and select **Test connection**. The result should start
   with `Connected to`.
3. Enter the **Client ID** and **Client secret** from Authentik.
4. Set **Button label** to `Authentik`, or a name your users recognize.
5. Leave **Scopes** empty to use `openid email profile`.
6. Turn on **Enable single sign-on** and select **Save**.
7. In a private window, open the sign-in page and select **Continue with Authentik**.

To pin these values instead, set the environment variables:

```bash
NUXT_OIDC_ISSUER=https://auth.example.com/application/o/ticketer/
NUXT_OIDC_CLIENT_ID=<client-id>
NUXT_OIDC_CLIENT_SECRET=<client-secret>
NUXT_OIDC_NAME=Authentik
```

Setting the issuer and client ID this way turns single sign-on on.

## Map Authentik groups to roles

Authentik's default `profile` scope mapping adds a `groups` claim with the names of the user's Authentik groups, which
is the claim Ticketer reads by default.

1. In Authentik, go to **Directory** > **Groups** and create the groups you need, for example `ticketer-admins`,
   `ticketer-staff` and `customers`. Add users to them.
2. In Ticketer, go to **Settings** > **Sign-in**.
3. Under **Groups to roles**, select **Add mapping** for each group:

   | Role | Group |
   | --- | --- |
   | Admin | `ticketer-admins` |
   | Member | `ticketer-staff` |
   | External | `customers` |

4. Leave **Groups claim** empty to use `groups`.
5. Optional: set **Role for new people** to **Nobody**, so only people in a mapped group, or with an invitation, get
   in.
6. Select **Save**.

The same mapping as an environment variable:

```bash
NUXT_OIDC_ROLE_GROUPS=admin:ticketer-admins,member:ticketer-staff,external:customers
```

Roles are set again at every sign-in, so moving someone between Authentik groups changes their Ticketer role the next
time they sign in.

## Link existing accounts

If people already have password accounts in Ticketer, single sign-on links to them by email only when Authentik sends
`email_verified: true`. Otherwise, those people see "Your email is not verified".

1. In Authentik, open the provider and check the **Preview** tab for a test user to see the `email_verified` value.
2. If it's not `true` and your Authentik users' email addresses are trustworthy, go to **Customization** >
   **Property Mappings** and create a **Scope Mapping**:
   - **Name**: `Ticketer email`.
   - **Scope name**: `email`.
   - **Expression**:

     ```python
     return {
         "email": request.user.email,
         "email_verified": True,
     }
     ```

3. Edit the provider. Under **Advanced protocol settings** > **Scopes**, replace the default email mapping with
   `Ticketer email`, and save.

::: warning
Only send `email_verified: True` if users can't set their own Authentik email address to someone else's. A verified
email lets that Authentik user sign in to the matching Ticketer account.
:::

## Turn on single sign-on only

After you've signed in once with Authentik as an admin, you can hide the password form:

1. Go to **Settings** > **Sign-in**.
2. Turn on **Single sign-on only** and select **Save**.

If Authentik is unavailable, admins can still sign in with a password at `/auth/login?password`.

## What's next

- [Set up single sign-on](/admin/single-sign-on)
- [Troubleshooting sign-in errors](/reference/troubleshooting#single-sign-on-errors)
- [Roles and permissions](/reference/roles)
