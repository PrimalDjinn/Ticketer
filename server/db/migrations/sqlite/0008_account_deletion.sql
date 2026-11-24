CREATE TABLE `account_deletions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`via` text NOT NULL,
	`actor_id` text,
	`tickets` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `integration_apps` ADD `can_delete` integer DEFAULT false NOT NULL;