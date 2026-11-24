CREATE TABLE `conversation_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`author_id` text,
	`body` text DEFAULT '' NOT NULL,
	`internal` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `conversation_messages_conversation_idx` ON `conversation_messages` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `conversation_reads` (
	`conversation_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`read_at` integer NOT NULL,
	PRIMARY KEY(`conversation_id`, `user_id`),
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` text NOT NULL,
	`subject` text,
	`status` text DEFAULT 'open' NOT NULL,
	`assignee_id` text,
	`ticket_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_message_at` integer,
	`closed_at` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `conversations_customer_idx` ON `conversations` (`customer_id`);--> statement-breakpoint
CREATE INDEX `conversations_status_idx` ON `conversations` (`status`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `conversations_assignee_idx` ON `conversations` (`assignee_id`);--> statement-breakpoint
CREATE TABLE `ticket_watchers` (
	`ticket_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`ticket_id`, `user_id`),
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ticket_watchers_user_idx` ON `ticket_watchers` (`user_id`);--> statement-breakpoint
ALTER TABLE `attachments` ADD `conversation_message_id` integer REFERENCES conversation_messages(id);--> statement-breakpoint
CREATE INDEX `attachments_conversation_message_idx` ON `attachments` (`conversation_message_id`);--> statement-breakpoint
ALTER TABLE `comments` ADD `internal` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `title` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `visibility` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `published_at` integer;--> statement-breakpoint
CREATE INDEX `tickets_visibility_idx` ON `tickets` (`visibility`);--> statement-breakpoint
UPDATE `users` SET `role` = 'external' WHERE `is_guest` = 1;--> statement-breakpoint
INSERT OR IGNORE INTO `ticket_watchers` (`ticket_id`, `user_id`, `created_at`) SELECT `id`, `creator_id`, `created_at` FROM `tickets` WHERE `creator_id` IS NOT NULL;--> statement-breakpoint
INSERT INTO `conversations` (`customer_id`, `subject`, `status`, `assignee_id`, `created_at`, `last_message_at`)
  SELECT CASE WHEN ua.`is_guest` = 1 THEN c.`user_a` ELSE c.`user_b` END, c.`id`, 'open',
         CASE WHEN ua.`is_guest` = 1 THEN c.`user_b` ELSE c.`user_a` END, c.`created_at`, c.`last_message_at`
  FROM `chats` c JOIN `users` ua ON ua.`id` = c.`user_a` JOIN `users` ub ON ub.`id` = c.`user_b`
  WHERE (ua.`is_guest` = 1) <> (ub.`is_guest` = 1);--> statement-breakpoint
INSERT INTO `conversation_messages` (`id`, `conversation_id`, `author_id`, `body`, `created_at`)
  SELECT m.`id`, cv.`id`, m.`from_id`, m.`body`, m.`created_at` FROM `messages` m JOIN `conversations` cv ON cv.`subject` = m.`chat_id`;--> statement-breakpoint
UPDATE `attachments` SET `conversation_message_id` = `message_id`, `message_id` = NULL
  WHERE `message_id` IN (SELECT `id` FROM `conversation_messages`);--> statement-breakpoint
INSERT OR IGNORE INTO `conversation_reads` (`conversation_id`, `user_id`, `read_at`)
  SELECT `id`, `customer_id`, COALESCE(`last_message_at`, `created_at`) FROM `conversations` WHERE `subject` IS NOT NULL
  UNION ALL
  SELECT `id`, `assignee_id`, COALESCE(`last_message_at`, `created_at`) FROM `conversations` WHERE `subject` IS NOT NULL AND `assignee_id` IS NOT NULL;--> statement-breakpoint
DELETE FROM `messages` WHERE `chat_id` IN (SELECT `subject` FROM `conversations` WHERE `subject` IS NOT NULL);--> statement-breakpoint
DELETE FROM `chats` WHERE `id` IN (SELECT `subject` FROM `conversations` WHERE `subject` IS NOT NULL);--> statement-breakpoint
UPDATE `conversations` SET `subject` = NULL WHERE `subject` IS NOT NULL;
