ALTER TABLE `tickets` ADD `assignee_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `tickets_assignee_idx` ON `tickets` (`assignee_id`);