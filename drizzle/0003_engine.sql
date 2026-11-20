CREATE TABLE `play` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`track_id` text NOT NULL,
	`profile_id` text,
	`wish_id` text,
	`queued_at` integer NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `track`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`wish_id`) REFERENCES `wish`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `play_once_per_session` ON `play` (`session_id`,`track_id`);--> statement-breakpoint
CREATE INDEX `play_of_session` ON `play` (`session_id`,`queued_at`);--> statement-breakpoint
ALTER TABLE `session` ADD `playback` text DEFAULT 'stopped' NOT NULL;