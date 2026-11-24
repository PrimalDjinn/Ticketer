# Delete accounts and personal data

This page explains the three ways to delete a Ticketer account, what each deletes and keeps, and how deletions are
recorded. Use it to handle a person's request to erase their data.

| Who deletes | Where | Tickets option |
| --- | --- | --- |
| The person themselves | **Account** page | Keep tickets, or also delete their private tickets |
| An admin | **Members** | Keep tickets, or also delete every ticket they opened |
| A connected app | `DELETE /api/integrations/v1/users` | Keep tickets, or also delete every ticket they opened |

Deletion can't be undone. The last admin can't be deleted by any of these paths; make someone else an admin first.

## Delete your own account

Anyone with a registered account can delete it. Guests have no **Account** page.

1. Open the user menu and select **Account**.
2. Under **Delete account**, select **Delete my account…**. The dialog lists what will be deleted.
3. Optional: if you opened private tickets, select **Also delete the … private tickets I opened**. Public issues you
   reported stay, without your name.
4. Confirm:
   - If your account has a password, enter **Your password**.
   - If it has none, for example because you sign in with single sign-on or through another app, type your email
     address.
5. Select **Delete account**.

You're signed out, and sessions on your other devices stop working.

If you're the only admin, the page shows `This is the only admin. Make someone else an admin first.` instead of the
button.

## Delete someone's account as an admin

1. In the sidebar, select **Members**.
2. In the person's row, select **Delete account**.
3. Optional: select **Also delete every ticket they opened**. This includes public issues.
4. Type the person's username to confirm, and select **Delete account**.

You can't delete your own account from **Members**; use the **Account** page.

## Delete an account from a connected app

An app can delete the external people it brought to Ticketer, for example when someone asks your product to erase their
data. An admin must turn on **Can delete people** for the app first. See
[Delete a person](/integrate/delete-people).

## What is deleted and what is kept

**Always deleted:**

- The account: profile, email, password and links to single sign-on or app identities.
- Pending invitations for their email, login links, password reset links, notifications and ticket follows.
- Support conversations they started, with every message in them (the team's replies and internal notes too) and their
  files.
- Direct message threads they were part of, for both people, with their files.

**Kept, shown as "Deleted user":**

- Tasks, task comments and project history they created.
- Messages and files they sent in other people's support conversations, as a teammate.
- Tickets and replies, depending on the tickets option below.

Tickets, conversations and tasks assigned to them become unassigned.

Notifications that other people received about them are kept as they are. Their text was written when the event
happened and can include the deleted person's name.

**Tickets, by option:**

| Option | Tickets they opened | Their replies on other tickets |
| --- | --- | --- |
| Keep tickets (default) | Kept, with "Deleted user" as the reporter. | Kept, with "Deleted user" as the author. |
| Also delete private tickets (Account page) | Private tickets deleted, with every reply and file on them. Public issues kept, with "Deleted user" as the reporter. | Text removed and files deleted. The reply shows "This reply was removed.", so replies under it keep their place. |
| Also delete every ticket (Members, apps) | All deleted, including public issues, with every reply and file on them. | Text removed and files deleted, as above. |

Deleted files are removed from storage, not only from the database.

## Audit record

Every deletion adds a row to the `account_deletions` table. It records no personal data:

| Column | Contents |
| --- | --- |
| `user_id` | The deleted account's ID. The account it pointed to no longer exists. |
| `role` | The role at deletion time, or `guest`. |
| `via` | `self`, `admin` or `app`. |
| `actor_id` | The admin's user ID, or the app ID. For `self`, the deleted account's own ID. |
| `tickets` | `keep`, `delete-private` or `delete`. |
| `summary` | Counts of what was removed: `tickets`, `ticketsKept`, `comments`, `conversations`, `directMessages`, `files`. |
| `created_at` | When the deletion happened. |

There's no screen for this table. Read it with a database tool, such as `sqlite3` on Docker and Node or
`wrangler d1 execute` on Cloudflare. The server log also records each deletion with the tag `[privacy]`.

## What's next

- [Invite people and manage roles](/admin/invite-people)
- [Delete a person from your app](/integrate/delete-people)
- [Roles and permissions](/reference/roles)
