# Invite people and manage roles

This page shows admins how to invite people by email, manage pending invitations, and change someone's role.

## Before you begin

- You're signed in as an admin.
- Optional: [email is set up](/admin/email). Without email, you copy the invitation link and send it yourself.

## Invite someone

1. In the sidebar, select **Members**.
2. Select **Invite**.
3. Enter the person's **Email**.
4. Under **Role**, choose **Team** or **Outside the team**:
   - **Team**: pick **Member**, **Viewer** or **Admin**. The default is **Member**.
   - **Outside the team**: the person joins as **External**.
5. Select **Send invitation**.

The dialog then shows the **Invitation link** and whether it was emailed. The link is shown only once; select
**Copy** if you want to send it yourself. Anyone with the link can join with the role you chose.

Invitation links:

- work once, for 7 days;
- are tied to the email address: the sign-up form uses that address and doesn't let the person change it;
- replace any earlier unused invitation for the same address.

You can't invite an address that already has an account. Change that person's role instead.

## Accept an invitation

The person opens the link, chooses a username and a password, and selects **Join**. If single sign-on is on, they can
instead select **Continue with** the provider and sign in with the same email address; the invitation then applies
when the provider reports the address as verified.

## Manage pending invitations

Pending invitations are listed at the top of **Members**, with their role, who sent them and when they expire.

- **Resend** (or **Renew**, once expired) creates a new link, restarts the 7 days and emails it again. The old link
  stops working.
- **Revoke** deletes the invitation.

## Change someone's role

1. In the sidebar, select **Members**.
2. Find the person. Use the search box, or the **Everyone**, **Team** and **External** tabs.
3. In the **Role** column, choose the new role.

The change applies immediately, without the person signing out. You can't change your own role, and Ticketer keeps at
least one admin.

::: tip
If single sign-on maps groups to roles, the mapping sets the role again at the person's next sign-in. Change their
groups at the identity provider instead. See [Set up single sign-on](/admin/single-sign-on#map-groups-to-roles).
:::

For what each role can do, see [Roles and permissions](/reference/roles). To remove someone, see
[Delete accounts and personal data](/admin/delete-accounts).

## What's next

- [Control who can sign up](/admin/sign-up)
- [Roles and permissions](/reference/roles)
- [Set up single sign-on](/admin/single-sign-on)
