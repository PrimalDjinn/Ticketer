# Work with tickets

This page explains how to report a problem as a ticket, and how the team follows up: replies, internal notes,
assignment and status.

## Report a problem

Anyone can open a ticket, with or without an account.

1. Select **New ticket** in the sidebar, or open `/tickets/new`. Visitors who aren't signed in can select **Report an
   issue** on the public help page at `/`.
2. Enter a **Title** (up to 140 characters) and a **Description** (up to 10,000 characters).
3. Optional: add **Screenshots and documents**, up to 10 files of 32 MB each.
4. Choose the **Urgency**:
   - **Normal**: handled in order.
   - **Urgent**: blocking your work.
   - **Emergency**: something is down for everyone.
5. Select **Open ticket**.

If you aren't signed in, Ticketer creates a guest session for you and shows a confirmation with the ticket reference.
If you register later in the same browser, the ticket moves to your account.

Admins are notified of every new ticket. You follow your own tickets automatically.

## Find tickets

- People on the team see every ticket under **Tickets**, with tabs by status and filters for assignee, visibility and
  dates.
- People outside the team see **My tickets** and can switch to **Public issues**.

## Reply and mention people

Write in the box under **Activity** and select **Comment** (or **Reply**, for the team). Type `@` to mention someone;
they get a notification. You can attach files to a comment, and reply to a comment to start a thread.

Who can reply:

| Who | Can reply |
| --- | --- |
| Admins and members | On every ticket |
| Viewers | Nowhere; they read and follow |
| The person who opened the ticket | On their ticket |
| Other external accounts | On public tickets |
| Guests | On tickets they opened |

## Write an internal note or a reply

For admins and members, the comment box starts on **Internal note**: a note only the team sees.

- To write a note, type it and select **Add note**. People outside the team never receive notes: not in the page, not
  in notifications, and not as files. Replies inside a note's thread are internal too, and only people on the team can
  be mentioned in a note.
- To answer the person who reported the ticket, select **Reply** first. The box turns amber and says who will see it:
  the reporter and anyone following, or everyone when the issue is public. Then select **Reply**.

After you post, the box goes back to **Internal note**.

## Follow a ticket

Select **Follow** on the ticket to get notifications about replies and changes; select **Unfollow** to stop. You follow
a ticket automatically when you open it, reply to it, or are assigned to it.

## Assign a ticket

Admins and members can assign a ticket to any admin or member.

- On the ticket, choose a person under **Assignee**, or select **Assign to me**.
- In the ticket list, open a ticket's actions menu and select **Assign to me**, or **Assign to** and a person. To
  remove the assignee, select **Unassign** (under **Assign to** when someone else has the ticket).

The assignee is notified and starts following the ticket.

## Change the status

Tickets have four statuses: **Open**, **Pending**, **Resolved** and **Closed**. Admins and members change the status
under **Status** on the ticket, or with **Mark …** in the ticket list's actions menu. Followers are notified.

Ticketer also changes the status for you when someone replies (internal notes don't count):

| When | Status becomes |
| --- | --- |
| An admin or member replies to an **Open** ticket | **Pending** |
| The person who opened the ticket replies to a **Resolved** or **Closed** ticket | **Pending** |

## Hand a ticket to a project

Admins and members can create a task from a ticket:

1. On the ticket, under **Tasks**, select **Create task in…**. In the **Tickets** list, use the folder button at the
   end of the ticket's row instead.
2. Choose a project.

A ticket goes to one task only. Once it has one, **Create task in…** is replaced by a link to the task: under **Tasks**
on the ticket, and as **Open task** in the ticket list.

The task gets the ticket's title and description, followed by a line `— From support ticket #` and the ticket's short
reference, the one shown in the ticket's header. Its priority follows the ticket's urgency: **Emergency** becomes
**Urgent**, **Urgent** becomes **High**, and **Normal** becomes **No priority**. The ticket lists its tasks and their
status under **Tasks**.

## Delete a ticket or comment

Admins can delete a ticket with **Delete ticket**. This removes its comments and files for good. You can delete your own
comments; admins can delete any comment.

## What's next

- [Publish an issue](/use/public-issues)
- [Answer support chats](/use/support-inbox)
- [Roles and permissions](/reference/roles)
