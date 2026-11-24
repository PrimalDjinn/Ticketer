# Publish an issue

This page explains how the team makes a ticket public, what visitors can see, and what stays private. Public issues let
customers follow known problems and announcements without signing in.

Public issues are listed at `/issues`, on the **Status and known issues** page, with a search box and a status filter.
Each issue has its own page at `/issues/<reference>`. Visitors reach it from **Status and issues** in the header of the
public pages, and from the sign-in page.

## The status banner

The top of **Status and known issues**, and the **Current status** section of the public help page at `/`, show a
one-line status:

| Banner | When |
| --- | --- |
| **No known issues** | No public ticket is **Open** or **Pending**. |
| **N open issues** | That many public tickets are **Open** or **Pending**. It's shown as a warning when any of them has the urgency **Urgent** or **Emergency**. |

The help page also lists those five most recently updated open issues, with their status.

Everything here updates by itself. When the team publishes an issue, people with Ticketer open see **New public
issue** in the corner, and the **Public issues** card on the dashboard, the help page and **Status and known issues**
show it within seconds. Visitors who aren't signed in get updates within a minute.

To change what the banner says, change the tickets: publish a ticket to announce a problem, and set it to **Resolved**
or **Closed** when it's fixed.

## Make a ticket public

Admins and members can publish a ticket.

1. Open the ticket.
2. In the **Private** card, select **Make public**.
3. Review what will be visible and select **Make public**.

To post an announcement or a known issue as public from the start, turn on **Public** when you create the ticket. The
button then reads **Publish**.

After publishing, the card offers **Copy public link** and **View public page**. Followers are notified that the
ticket was made public.

## Make a ticket private again

On the ticket, select **Make private**, or select **Make private** in the ticket list's actions menu. The ticket
disappears from `/issues` straight away. Outside followers who aren't the reporter stop seeing it.

## What visitors see

Anyone with the link, including people without an account, can read:

- the title, description and attached files;
- every reply that isn't an internal note, with the authors' names and a **Team** badge on replies from the team;
- the status and urgency;
- the reporter's name and the assignee's name;
- when the issue was opened, last updated and resolved.

## What stays private

- Internal notes, replies in an internal note's thread, and their files.
- User IDs and email addresses.
- Tasks linked to the ticket.

## Who can take part

| Who | Can do |
| --- | --- |
| Visitors without an account | Read. Signing in is offered to reply or follow. |
| External accounts | Read, reply and follow. |
| Viewers | Read and follow. |
| Admins and members | Everything, including internal notes. |

Guests (people with only a guest session) can read public issues but can't reply to or follow issues they didn't open.

## What's next

- [Work with tickets](/use/tickets)
- [Roles and permissions](/reference/roles)
