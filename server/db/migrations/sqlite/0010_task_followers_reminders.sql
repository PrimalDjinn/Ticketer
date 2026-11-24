CREATE TABLE `task_watchers` (
	`task_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`task_id`, `user_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_watchers_user_idx` ON `task_watchers` (`user_id`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `due_reminded_for` text;--> statement-breakpoint
ALTER TABLE `users` ADD `task_reminders` integer DEFAULT true NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `task_watchers` (`task_id`, `user_id`, `created_at`) SELECT `id`, `creator_id`, `created_at` FROM `tasks` WHERE `creator_id` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `task_watchers` (`task_id`, `user_id`, `created_at`) SELECT `id`, `assignee_id`, `created_at` FROM `tasks` WHERE `assignee_id` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `task_watchers` (`task_id`, `user_id`, `created_at`) SELECT `task_id`, `author_id`, MIN(`created_at`) FROM `task_comments` WHERE `author_id` IS NOT NULL GROUP BY `task_id`, `author_id`;
