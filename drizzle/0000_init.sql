CREATE TABLE `login` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `spotify_account`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spotify_account` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`image_url` text,
	`player_of` text,
	`refresh_token` text NOT NULL,
	`access_token` text,
	`access_token_expires_at` integer,
	`scope` text NOT NULL,
	`authorized_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`player_of`) REFERENCES `spotify_account`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spotify_account_player_of_unique` ON `spotify_account` (`player_of`);