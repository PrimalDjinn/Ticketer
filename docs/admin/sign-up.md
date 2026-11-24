# Control who can sign up

This page explains who can create a Ticketer account without an invitation, and how admins change it.

By default, sign-up is invitation-only: people join through an [invitation link](/admin/invite-people). The first
account on a new deployment is the exception; it can always be created, and it becomes the admin.

## Sign-up modes

| Mode | Label in Ticketer | New accounts get |
| --- | --- | --- |
| `invite` | **Invitation only** | Nothing; the sign-up form is closed. This is the default. |
| `external` | **Anyone, as external** | The external role: their own tickets, public issues and support chat. Use this for a customer portal. |
| `viewer` | **Anyone, as viewer** | The viewer role: read access to every project and ticket. |
| `member` | **Anyone, as member** | The member role: they can edit projects, tasks and tickets. |

::: warning
With **Anyone, as viewer** or **Anyone, as member**, anyone who finds the sign-up page joins your team and can read
every ticket, including internal notes. Use **Anyone, as external** for a public portal.
:::

## Change the mode

1. In the sidebar, select **Members**.
2. Open the **Who can sign up** menu next to **Invite**.
3. Choose a mode. The change applies immediately.

**Settings** > **Overview** shows the current mode and links to **Members**.

## How the mode interacts with other ways in

- **Invitations** work in every mode and set the role chosen by the admin.
- **Single sign-on** doesn't use this setting. People who sign in with single sign-on for the first time get the role
  from **Role for new people** in **Settings** > **Sign-in**. See
  [Set up single sign-on](/admin/single-sign-on#choose-who-gets-in).
- **Single sign-on only** mode turns off password sign-up whatever this setting says.
- **Connected apps** can create external accounts if the admin allowed it for that app. See
  [Connect an app](/admin/integrations).
- **Guests** don't need an account to open a ticket or start a support chat. If they register later, their tickets and
  chats move to the new account.

## What's next

- [Invite people and manage roles](/admin/invite-people)
- [Set up single sign-on](/admin/single-sign-on)
- [Roles and permissions](/reference/roles)
