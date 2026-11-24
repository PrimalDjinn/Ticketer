# Set up due-date reminders

This page explains when Ticketer reminds people about tasks that are due, and how to choose the time and time zone.

## How reminders work

Once a day, Ticketer reminds people about open tasks:

- **Due tomorrow**: one reminder the day before.
- **Due today**: one reminder on the day, if the due date was set or moved after the previous day's reminders.

Each due date is reminded about once. Moving the due date to another day arms a new reminder. Tasks in a done column
aren't reminded about.

The reminder goes to the task's assignee. When nobody is assigned, it goes to the task's followers. It arrives like any
other notification: in the app, as a push notification, and by email for people who turned email copies on. Anyone
can turn reminders off for themselves on the **Account** page. See [Get notifications](/use/notifications).

## Choose the time and time zone

1. Open **Settings**, then **Reminders**.
2. Make sure **Send reminders** is on.
3. Under **Time**, choose the hour, such as `08:00`.
4. Under **Time zone**, choose your team's time zone. If the page offers your own, select **Use …**.
5. Select **Save**.

The time zone also decides when "today" and "tomorrow" start. Until you change it, reminders go out at 08:00 UTC.

To send the reminders that are due without waiting, select **Send due reminders now**. Tasks that already had their
reminder are skipped.

To stop all reminders, turn off **Send reminders** and select **Save**.

## Scheduling

Ticketer checks for reminders every hour and sends them at the hour you chose.

- **Docker and Node**: the server runs the check itself. Run a single instance, or several sharing one database;
  each reminder is still sent once.
- **Cloudflare**: the Worker has a cron trigger, `0 * * * *`, set in `wrangler.jsonc`. Deploys from this repository,
  including the Deploy to Cloudflare button, add it. To check it, open the Worker in the Cloudflare dashboard and go to
  **Settings**, then **Triggers**.

Reminder emails link back to your site. Ticketer learns its address when someone in the team opens it; until then,
**Settings → Reminders** shows a warning and reminders wait. To set the address yourself, set `NUXT_SITE_URL`. See
[Environment variables](/reference/environment-variables#site-address).

## What's next

- [Plan work in projects](/use/projects#follow-a-task)
- [Get notifications](/use/notifications)
