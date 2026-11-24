# Plan work in projects

This page explains how the team tracks work in projects: views, tasks and their details, keyboard shortcuts, and
linking support tickets to tasks.

Projects are for the team only. Admins and members can change them; viewers can read them. People outside the team
don't see projects.

## Create a project

1. Select **New project** on the **Projects** page, or from the command palette (`Ctrl+K` or `Cmd+K`).
2. Enter a **Name**. Ticketer suggests a **Key** from it; you can change it. The key is 2 to 10 letters or digits,
   starting with a letter, and prefixes task numbers, such as `WEB-12`.
3. Optional: add a **Description** and pick a **Colour**.
4. Select **Create project**.

A new project has four columns: **To do**, **In progress**, **In review** and **Done**.

## Change a project's settings

Open a project and select the settings button next to the view tabs. The settings have four tabs:

- **General**: name, description and colour. Admins and members can archive the project here; only admins can delete
  it.
- **Workflow**: the columns. A column marked as done counts tasks in it as finished.
- **Fields**: custom fields for this project's tasks. See [Add custom fields](#add-custom-fields).
- **Labels**: labels shared by all projects.

## Switch views

Each project has four views. The view is kept in the URL, so a link opens the same view.

| View | What it shows |
| --- | --- |
| **Board** | A column per status. Drag cards between columns and within a column. |
| **List** | Tasks grouped by status. |
| **Calendar** | Tasks on their due date, a month at a time. Drag a task to another day to reschedule it. Undated tasks wait in a tray; drag one onto a day to schedule it. You can create a task directly on a day. |
| **Gantt** | Tasks as bars from start date to due date. Drag a bar to move it, or drag its edges to change the start or due date. Zoom by day or week. Tasks without dates are listed under **Unscheduled**. |

Use the filter bar to search tasks and narrow them by assignee, priority and label. **My tasks** in the sidebar lists
the open tasks assigned to you across projects, grouped by **Overdue**, **Due soon**, **Later** and **No due date**.

## Keyboard shortcuts

| Key | Action | Where |
| --- | --- | --- |
| `C` | New task | A project |
| `I` | Assign the open task to yourself | A task |
| `/` | Focus the filter bar | A project |
| `Ctrl+B` or `Cmd+B` | Switch between board and list | A project |
| `Ctrl+K` or `Cmd+K` | Open the command palette | Anywhere in the app |
| `Ctrl+Enter` or `Cmd+Enter` | Send a comment | A comment box |
| `Esc` | Close the task panel | An open task |

## Work with a task

A task has a title, a description, a status, a priority (**Urgent**, **High**, **Medium**, **Low** or **No
priority**), an assignee, a start date, a due date, labels, subtasks, attachments and comments. The **Activity** tab
records every change.

To assign a task quickly, use the assignee menu on a board card or list row, or press `I` with the task open.

### Follow a task

Followers are notified when someone comments on the task, moves it to another column, completes it, or reassigns it.
They don't hear about their own changes.

- The person who creates a task, its assignee, and anyone who comments follow it automatically.
- To follow any task, select **Follow** at the top of the task. Select **Following** to stop.
- **Followers** in the task's details lists who follows it. Point to it to see their names.

The assignee also gets **assigned you** when they're given the task, and a reminder before it's due. See
[Set up due-date reminders](/admin/reminders). When a repeating task creates its next occurrence, the followers carry
over.

### Link related tasks

In a task, select **Add relation**, choose **Blocked by**, **Blocks** or **Relates to**, and search for the other task
by title or key, such as `WEB-12`. The relation shows on both tasks.

### Repeat a task

Choose a repeat rule in the task's properties: **Daily**, **Weekly**, **Monthly**, **Yearly** or **Every N days**.
When a repeating task moves to a done column, Ticketer creates the next occurrence in the project's first open column.
The next task keeps the title, description, priority, assignee, labels and custom field values, and its dates move
forward by the interval. A task without dates gets a due date counted from today.

### Add custom fields

1. Open the project settings and go to **Fields**.
2. Select **Add field**, enter a name and choose a type: **Text**, **Number**, **Date**, **Select**, **Multi-select**
   or **Checkbox**. Select and multi-select fields need choices.
3. Optional: turn on **Required**.
4. Select **Save fields**.

A project can have up to 20 fields. Removing a field deletes its values from every task when you save.

## Link tickets to tasks

From a support ticket, admins and members select **Create task in…** and choose a project. The task carries the
ticket's text, and the ticket lists the task and its status under **Tasks**. See
[Hand a ticket to a project](/use/tickets#hand-a-ticket-to-a-project).

## What's next

- [Work with tickets](/use/tickets)
- [Roles and permissions](/reference/roles)
