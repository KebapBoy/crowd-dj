CREATE TABLE `profile` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_token_hash_unique` ON `profile` (`token_hash`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`host_id` text NOT NULL,
	`mode` text DEFAULT 'wishes_first' NOT NULL,
	`anonymous` integer DEFAULT false NOT NULL,
	`max_open_wishes` integer,
	`max_session_wishes` integer,
	`max_pool_size` integer,
	`skip_own` integer DEFAULT true NOT NULL,
	`skip_voting` integer DEFAULT false NOT NULL,
	`skip_votes` integer DEFAULT 2 NOT NULL,
	`skip_percent` integer DEFAULT 50 NOT NULL,
	`created_at` integer NOT NULL,
	`active_at` integer NOT NULL,
	`ended_at` integer,
	`end_reason` text,
	FOREIGN KEY (`host_id`) REFERENCES `spotify_account`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_open_per_host` ON `session` (`host_id`) WHERE ended_at is null;--> statement-breakpoint
CREATE TABLE `session_member` (
	`session_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`session_id`, `profile_id`),
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade
);
