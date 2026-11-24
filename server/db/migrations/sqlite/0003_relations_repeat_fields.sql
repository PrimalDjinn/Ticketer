CREATE TABLE `project_fields` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_fields_project_idx` ON `project_fields` (`project_id`);--> statement-breakpoint
CREATE TABLE `task_field_values` (
	`task_id` integer NOT NULL,
	`field_id` integer NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`task_id`, `field_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`field_id`) REFERENCES `project_fields`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_field_values_field_idx` ON `task_field_values` (`field_id`);--> statement-breakpoint
CREATE TABLE `task_relations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`related_task_id` integer NOT NULL,
	`type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_relations_pair_idx` ON `task_relations` (`task_id`,`related_task_id`);--> statement-breakpoint
CREATE INDEX `task_relations_related_idx` ON `task_relations` (`related_task_id`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `repeat` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `repeat_interval` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `repeated_from_id` integer;