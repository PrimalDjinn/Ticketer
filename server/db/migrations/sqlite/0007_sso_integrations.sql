CREATE TABLE `integration_apps` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`allowed_origins` text DEFAULT '[]' NOT NULL,
	`landing` text DEFAULT 'new-ticket' NOT NULL,
	`can_provision` integer DEFAULT true NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`signing_secret` text NOT NULL,
	`created_by_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`rotated_at` integer,
	`last_used_at` integer,
	`api_calls` integer DEFAULT 0 NOT NULL,
	`sign_ins` integer DEFAULT 0 NOT NULL,
	`tickets_created` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_apps_key_hash_unique` ON `integration_apps` (`key_hash`);--> statement-breakpoint
CREATE TABLE `integration_nonces` (
	`app_id` text NOT NULL,
	`nonce` text NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`app_id`, `nonce`),
	FOREIGN KEY (`app_id`) REFERENCES `integration_apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `integration_nonces_expires_idx` ON `integration_nonces` (`expires_at`);--> statement-breakpoint
CREATE TABLE `login_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`app_id` text,
	`target` text NOT NULL,
	`return_url` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`app_id`) REFERENCES `integration_apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `login_links_token_hash_unique` ON `login_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `login_links_expires_idx` ON `login_links` (`expires_at`);--> statement-breakpoint
CREATE TABLE `user_identities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_identities_provider_subject_idx` ON `user_identities` (`provider`,`subject`);--> statement-breakpoint
CREATE INDEX `user_identities_user_idx` ON `user_identities` (`user_id`);