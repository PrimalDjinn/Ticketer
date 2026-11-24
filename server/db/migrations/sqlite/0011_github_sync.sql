CREATE TABLE `github_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `github_installations` (
	`id` integer PRIMARY KEY NOT NULL,
	`account_login` text NOT NULL,
	`account_type` text DEFAULT 'User' NOT NULL,
	`suspended` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_github` (
	`project_id` integer PRIMARY KEY NOT NULL,
	`installation_id` integer NOT NULL,
	`repo_id` integer NOT NULL,
	`repo_full_name` text NOT NULL,
	`create_issues` integer DEFAULT true NOT NULL,
	`import_issues` integer DEFAULT true NOT NULL,
	`comments_from_github` integer DEFAULT true NOT NULL,
	`comments_to_github` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_github_repo_idx` ON `project_github` (`repo_id`);--> statement-breakpoint
CREATE TABLE `task_github` (
	`task_id` integer PRIMARY KEY NOT NULL,
	`repo_id` integer NOT NULL,
	`issue_number` integer NOT NULL,
	`url` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_github_issue_idx` ON `task_github` (`repo_id`,`issue_number`);--> statement-breakpoint
ALTER TABLE `task_comments` ADD `github_comment_id` integer;--> statement-breakpoint
ALTER TABLE `task_comments` ADD `external_author` text;--> statement-breakpoint
ALTER TABLE `task_comments` ADD `external_url` text;--> statement-breakpoint
CREATE UNIQUE INDEX `task_comments_github_idx` ON `task_comments` (`github_comment_id`);