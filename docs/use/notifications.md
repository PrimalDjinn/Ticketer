# Get notifications

This page explains how Ticketer tells you about new tickets, replies, mentions and assignments: in the app, as push
notifications on your devices, and by email. It also shows how to turn each one on or off.

## What you're notified about

| Event | Who is notified |
| --- | --- |
| New ticket | Admins |
| New support conversation | Admins |
| Reply or status change on a ticket | Its followers who can see it |
| Ticket assigned | The assignee |
| Mention | The person mentioned, if they can read the comment |
| Reply in a conversation | The customer (team replies) or the assignee (customer messages) |

For more, see [Roles and permissions](/reference/roles#notifications).

## In the app

Notifications always appear in the app:

- **Notifications** in the sidebar opens the list. Select one to open its page, or select **Mark all as read**.
- While Ticketer is open, a new notification also shows as a message in the corner, with **Open** when it links to a
  page. If the tab is in the background, it plays a sound.

## Push notifications

Push notifications reach your device even when every Ticketer tab is closed. They're set per browser, so turn them on
in each browser and on each device where you want them.

To turn them on, do one of the following:

- In **Notifications**, select **Turn on** under **Get notified when Ticketer is closed**.
- Open the user menu, select **Account**, and turn on **Push notifications on this device** under **Notifications**.

Then allow notifications when the browser asks.

How push notifications behave:

- Each one shows the notification's text. Selecting it opens the page it's about, in an existing Ticketer tab if there
  is one.
- Nothing pops up while a Ticketer tab is in front of you; the app shows the notification instead.
- A newer notification about the same page, such as another reply on the same ticket, replaces the older one on your
  device.
- If your device is offline, the push service keeps the notification for up to a day.
- If Ticketer's push key changes, for example after the admin changes `NUXT_APP_SECRET`, your browser subscribes again
  by itself the next time you open Ticketer, as long as notifications are still allowed.

To check that push works, select **Send a test** on the **Account** page. The test appears only when no Ticketer tab is
in front of you, so switch to another tab or app.

To turn push off for a browser, turn off **Push notifications on this device** on the **Account** page in that
browser. Signing out also turns push off for that browser, so the next person who uses it doesn't get your
notifications.

On iPhone and iPad, push notifications work only after you add Ticketer to the Home Screen and open it from there.

## Email copies

Ticketer can also email you a copy of each notification, with a link to the page. Copies are sent whether or not you
have Ticketer open.

- Email copies are on by default for people outside the team, and off by default for admins, members and viewers.
- To change it, open the user menu, select **Account**, and turn **Email me notifications** on or off.
- Ticketer sends at most one email per page every 10 minutes, so a busy thread doesn't fill your inbox.
- Each email has a link to turn the copies off.

Email copies need email to be set up on your deployment. If it isn't, the **Account** page says so and nothing is sent.
See [Set up email](/admin/email).

Guests, who have no account, can't turn on push notifications or email copies.

## Troubleshooting

### The Turn on button is missing or the switch is greyed out

- **Blocked in this browser**: you, or the browser, blocked notifications for the site. Allow notifications for the
  site in the browser's site settings, then reload the page and turn push on again.
- **This browser doesn't support push notifications**: use another browser. On iPhone and iPad, add Ticketer to the
  Home Screen first.

### Push notifications don't arrive

1. On the **Account** page, select **Send a test**, then switch away from Ticketer.
2. If the result is **Nothing was delivered**, turn **Push notifications on this device** off and on again.
3. If the test arrives but real notifications don't, check that you follow the ticket or are the one being notified.
   See [What you're notified about](#what-you-re-notified-about).
4. Check the notification settings of your operating system, for example Focus or Do Not Disturb modes, and whether
   the browser may show notifications.

Admins can find push errors in the server log under the tag `[push]`.

### Email copies don't arrive

- Check that **Email me notifications** is on.
- If the **Account** page says email isn't set up, ask an admin to [set up email](/admin/email).
- Several notifications about the same page within 10 minutes produce one email.
- Check your spam folder.

## What's next

- [Work with tickets](/use/tickets)
- [Set up email](/admin/email)
- [Troubleshooting](/reference/troubleshooting#push-notifications-stopped-working-for-everyone)
