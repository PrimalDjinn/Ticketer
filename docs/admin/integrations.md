# Connect an app

This page shows admins how to connect another product to Ticketer, so it can send its users to Ticketer to report a
problem, chat with support or see their tickets. It covers creating the app, handling its credentials, and turning it
off. For the developer side, see [Integrate your app](/integrate/).

Connected apps only ever sign in or create **external** accounts. An app can't sign in an admin, member or viewer.

## Before you begin

- You're signed in as an admin.
- The address of the other app, if you want Ticketer to show a **Back to** link to it.

## Create the app

1. Go to **Settings** > **Integrations** and select **Connect an app**.
2. Enter a **Name**. People see it as "Back to …" and on tickets as "Reported from …".
3. Optional: in **Allowed return origins**, enter the other app's origins, one per line, such as
   `https://app.example.com`. A return URL sent by the app is used only if its origin is in this list. Leave it empty
   for no back link. You can add up to 20 origins.
4. Choose the **Landing page**: where people arrive when the request doesn't ask for something else.
   - **New ticket**: the report form, prefilled with what the app sends. This is the default.
   - **Support chat**: opens a chat with the support team.
   - **My tickets**: the list of their tickets.
5. Choose whether the app **May create accounts**. On (the default), people without an account get an external one.
   Off, the app can only sign in people who already have an external account.
6. Optional: turn on **Can delete people** to let the app delete the external people it brought here, for
   data-deletion requests. It's off by default and never applies to team members. See
   [Delete a person](/integrate/delete-people).
7. Select **Create app**.

## Store the credentials

After you create the app, Ticketer shows three values:

| Value | Format | Used for | Secret |
| --- | --- | --- | --- |
| **App ID** | `app_` and 26 characters | The `app` parameter of browser links | No |
| **API key** | `tkt_` and 48 hex characters | Server-to-server calls | Yes |
| **Signing secret** | `tks_` and 64 hex characters | Signing browser launch links | Yes |

1. Copy the API key and the signing secret into the other app's server configuration, for example as
   `TICKETER_API_KEY` and `TICKETER_SIGNING_SECRET`.
2. Select **I have copied them**.

::: warning
The API key and signing secret are shown only once. Never put them in browser code. Ticketer stores only a SHA-256
hash of the API key, and stores the signing secret encrypted with a key derived from `NUXT_APP_SECRET`.
:::

The **How to connect** section on the same page has copy-paste samples filled in with your site's address and the
app's ID.

## Rotate the credentials

Rotate when a key or secret may have leaked, or when someone who knew them leaves.

1. Go to **Settings** > **Integrations**.
2. Open the app's actions menu and select **Rotate key and secret**.
3. Select **Rotate**.
4. Copy the new API key and signing secret into the other app.

The old key and secret stop working immediately, so update the other app straight away.

## Edit, turn off or delete an app

From the app's actions menu:

- **Edit** changes the name, allowed return origins, landing page, and whether it may create accounts or delete
  people.
- **Turn off** (or the switch next to the app) stops its key and links from working until you turn it on again.
- **Delete** removes the app. Its key and links stop working immediately. People and tickets it created stay;
  the links between those accounts and the app's user IDs are removed.

## Monitor usage

Each app shows **Last used**, **API calls**, **Sign-ins**, **Tickets** (tickets it created) and **People** (accounts
it has linked). The server log records every use of a key with the tag `[integrations]`.

## What's next

- [Choose a flow](/integrate/)
- [Security model](/integrate/security)
- [Integration API reference](/reference/integration-api)
