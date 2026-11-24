# Sync projects with GitHub issues

This page explains how to connect a project to a GitHub repository, so its tasks and the repository's issues stay in
step both ways.

## What syncs

| On GitHub | In Ticketer |
| --- | --- |
| A new issue | A new task in the project's first column |
| Title and description edits | The task's title and description |
| Closing or reopening the issue | Moving the task to the first done column, or back to the first open column |
| Labels | The task's labels, matched by name. Missing labels are created. |
| A comment, and edits or deletion of it | A comment on the task, shown with the GitHub user's name and **via GitHub** |

| In Ticketer | On GitHub |
| --- | --- |
| A new task | A new issue, with a link back to the task at the end of the description |
| Title and description edits | The issue's title and body |
| Moving the task into or out of a done column | Closing (as completed) or reopening the issue |
| Labels | The issue's labels. Missing labels are created on the repository. |
| A comment, if you turn it on | A comment by the app, starting with the author's name |

Assignees, priority, due dates and pull requests don't sync. Deleting a task leaves its issue on GitHub; deleting or
transferring an issue unlinks its task.

Each project syncs with one repository, and each repository with one project.

## Before you begin

- You need to be an admin in Ticketer to set up the GitHub App, and an owner of the GitHub account or organisation
  that holds the repositories, to install it.
- GitHub must be able to reach your site at `https://<your site>/api/github/webhook`. A site on `localhost` can send
  changes to GitHub, but won't receive them.

## Step 1: Create the GitHub App

Ticketer talks to GitHub through a GitHub App that belongs to you. The quickest way to make one:

1. In Ticketer, open **Settings**, then **GitHub**.
2. Enter an **App name**, which must be unique on GitHub. To own the app with an organisation, enter its login under
   **Organisation**; otherwise it belongs to your GitHub account.
3. Select **Create on GitHub**.
4. On GitHub, check the details and select **Create GitHub App**.

GitHub sends you back to Ticketer with the app's keys saved, encrypted. The app is private: only the account that owns
it can install it.

The app asks for **Issues: read and write** and **Metadata: read**, and receives the **Issues** and **Issue comment**
events.

### Use an existing app instead

Under **Settings → GitHub**, select **I already have an app** and enter its **App ID**, **URL name** (the `<slug>` in
`github.com/apps/<slug>`), **Private key** (the whole `.pem` file) and **Webhook secret**. Give the app the permissions
and events above, and point its webhook at `https://<your site>/api/github/webhook`.

Or set environment variables. Each takes precedence over its field in Settings:

```sh
NUXT_GITHUB_APP_ID=123456
NUXT_GITHUB_APP_SLUG=acme-ticketer
NUXT_GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n…"   # \n sequences work
NUXT_GITHUB_WEBHOOK_SECRET=…
```

For GitHub Enterprise Server, also set `NUXT_GITHUB_API_URL` (such as `https://github.example.com/api/v3`) and
`NUXT_GITHUB_WEB_URL` (such as `https://github.example.com`).

## Step 2: Install the app

1. Under **Settings → GitHub**, select **Install on GitHub**.
2. Choose the account or organisation, and either **All repositories** or the ones to sync.
3. Select **Install**. GitHub sends you back to Ticketer, which lists the account under **Installed on**.

To give the app access to more repositories later, select **Repositories** next to the account.

## Step 3: Link a project

Admins and members can link a project.

1. Open the project, open its settings, and go to **GitHub**.
2. Under **Repository**, choose the repository.
3. Choose what syncs:
   - **New tasks become issues**: on by default.
   - **New issues become tasks**: on by default.
   - **Bring in comments from GitHub**: on by default.
   - **Post task comments to GitHub**: off by default, because task comments are meant for the team and the
     repository may be public.
4. Select **Link repository**.

Linking doesn't change existing tasks or issues. To bring in the repository's open issues, select **Import open
issues**. It imports each open issue once, so it's safe to select again.

## Work with linked tasks

- A task with an issue shows its number, such as **#42**, next to its key. Select it to open the issue. Board cards
  show it too.
- To create an issue for a task that doesn't have one, open the task's **⋯** menu and select **Create issue in
  owner/repo**.
- When an issue is closed or reopened on GitHub, the task's followers are notified.

## Unlink a project

In the project's settings, go to **GitHub** and select **Unlink**. Tasks and issues both stay; they stop syncing.

## Troubleshooting

### Changes on GitHub don't arrive

1. On GitHub, open the app's settings and go to **Advanced**. **Recent Deliveries** lists each webhook with
   Ticketer's answer.
2. A **401** answer means the webhook secret in Ticketer doesn't match the app's. Enter it again under
   **Settings → GitHub → Edit**.
3. A connection error means GitHub can't reach your site. Check the **Webhook address** shown in
   **Settings → GitHub**.
4. A failed delivery can be sent again with **Redeliver**. Ticketer applies each delivery once.

### Changes in Ticketer don't reach GitHub

The server log shows the reason under the tag `[github]`. Common causes:

- The app was uninstalled, or lost access to the repository. Check **Repositories** next to the account in
  **Settings → GitHub**.
- **Settings → GitHub** shows a problem with the keys, such as after `NUXT_APP_SECRET` changed. Enter them again.

## What's next

- [Plan work in projects](/use/projects)
- [Environment variables](/reference/environment-variables#github)
