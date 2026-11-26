ALTER TABLE `inbox` ADD `complete` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `inbox_item` ADD `imported_to` text REFERENCES profile(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `profile` ADD `spotify_verified` integer DEFAULT false NOT NULL;