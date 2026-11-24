# Roles and permissions

This page lists what each role can do in Ticketer. Admins change roles on **Members**; see
[Invite people and manage roles](/admin/invite-people).

## Roles

| Role | On the team | Description |
| --- | --- | --- |
| Admin | Yes | Manages people, settings and integrations, and does everything a member can. |
| Member | Yes | Works on projects, tasks, tickets and support chats. |
| Viewer | Yes | Reads everything the team sees, changes nothing. |
| External | No | A customer, partner or anyone else outside the team. |
| Guest | No | Someone without an account who opened a ticket or a chat. Ticketer gives them a guest session; registering turns it into an account and keeps their history. |

Visitors without any session can read public issues, open a ticket and start a chat; doing either gives them a guest
session.

A role change applies immediately, without the person signing out.

## Tickets

| Action | Admin | Member | Viewer | External | Guest |
| --- | --- | --- | --- | --- | --- |
| Open a ticket | Yes | Yes | Yes | Yes | Yes |
| See tickets | All | All | All | Own and public | Own and public |
| Reply | All | All | No | Own and public | Own |
| Follow | Yes | Yes | Yes | Own and public | Own |
| Read internal notes | Yes | Yes | Yes | No | No |
| Write internal notes | Yes | Yes | No | No | No |
| Change status, assignee, title | Yes | Yes | No | No | No |
| Make public or private, or open as public | Yes | Yes | No | No | No |
| Be assigned | Yes | Yes | No | No | No |
| Create a task from a ticket | Yes | Yes | No | No | No |
| Delete own comment | Yes | Yes | Yes | Yes | Yes |
| Delete any comment | Yes | No | No | No | No |
| Delete a ticket | Yes | No | No | No | No |

People outside the team never receive internal notes, other people's user IDs, or tasks linked to a ticket.

## Support chats

| Action | Admin | Member | Viewer | External | Guest |
| --- | --- | --- | --- | --- | --- |
| Start a support chat | No | No | No | Yes | Yes |
| See conversations | All | All | All | Own | Own |
| Reply | Yes | Yes | No | Own | Own |
| Write internal notes | Yes | Yes | No | No | No |
| Assign, close, reopen, create a ticket | Yes | Yes | No | No | No |
| Be assigned | Yes | Yes | No | No | No |
| Direct messages with teammates | Yes | Yes | Yes | No | No |

## Projects and tasks

| Action | Admin | Member | Viewer | External | Guest |
| --- | --- | --- | --- | --- | --- |
| See projects, tasks and **My tasks** | Yes | Yes | Yes | No | No |
| Create and edit tasks, comment on tasks | Yes | Yes | No | No | No |
| Create projects; edit workflow, fields and labels | Yes | Yes | No | No | No |
| Archive a project | Yes | Yes | No | No | No |
| Delete a project | Yes | No | No | No | No |

## Administration

| Action | Admin | Member | Viewer | External | Guest |
| --- | --- | --- | --- | --- | --- |
| **Members**: list people, change roles | Yes | No | No | No | No |
| Invite people, manage invitations | Yes | No | No | No | No |
| Change **Who can sign up** | Yes | No | No | No | No |
| **Settings**: email, sign-in, integrations | Yes | No | No | No | No |

## Your account

| Action | Admin | Member | Viewer | External | Guest |
| --- | --- | --- | --- | --- | --- |
| Change own password (**Account** page) | Yes | Yes | Yes | Yes, if the account has a password | No |
| Delete own account (**Account** page) | Yes, unless the last admin | Yes | Yes | Yes | No |
| Delete other people's accounts (**Members**) | Yes | No | No | No | No |

See [Delete accounts and personal data](/admin/delete-accounts).

## Notifications

| Event | Who is notified |
| --- | --- |
| New ticket | Admins |
| New support conversation | Admins |
| Reply or status change on a ticket | Its followers who can see it |
| Ticket assigned | The assignee |
| Mention | The person mentioned, if they can read the comment |
| Reply in a conversation | The customer (team replies) or the assignee (customer messages) |

## What's next

- [Invite people and manage roles](/admin/invite-people)
- [Control who can sign up](/admin/sign-up)
