CREATE TABLE `pool_item` (
	`profile_id` text NOT NULL,
	`track_id` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `track_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `track`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pool_item_newest` ON `pool_item` (`profile_id`,`added_at`);--> statement-breakpoint
CREATE TABLE `track` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`artists` text NOT NULL,
	`album` text NOT NULL,
	`cover_url` text,
	`duration_ms` integer NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wish` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`track_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`played_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `track`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wish_once_per_session` ON `wish` (`session_id`,`track_id`);--> statement-breakpoint
CREATE INDEX `wish_of_profile` ON `wish` (`session_id`,`profile_id`,`created_at`);