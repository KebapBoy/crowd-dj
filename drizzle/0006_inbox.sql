CREATE TABLE `inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`host_id` text NOT NULL,
	`session_id` text,
	`invite_url` text,
	`snapshot_id` text,
	`synced_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`host_id`) REFERENCES `spotify_account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_session_id_unique` ON `inbox` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_lasting_per_host` ON `inbox` (`host_id`) WHERE session_id is null;--> statement-breakpoint
CREATE TABLE `inbox_item` (
	`inbox_id` text NOT NULL,
	`track_id` text NOT NULL,
	`added_by` text NOT NULL,
	`added_at` integer NOT NULL,
	`imported_at` integer,
	PRIMARY KEY(`inbox_id`, `track_id`, `added_by`),
	FOREIGN KEY (`inbox_id`) REFERENCES `inbox`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `track`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inbox_item_added_by` ON `inbox_item` (`added_by`);--> statement-breakpoint
ALTER TABLE `profile` ADD `spotify_user_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `profile_spotify_user_id_unique` ON `profile` (`spotify_user_id`);