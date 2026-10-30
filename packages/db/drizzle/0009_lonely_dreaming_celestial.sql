CREATE TABLE `data_source_structure` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`data_source_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`payload` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`synced_at` integer,
	`next_attempt_at` integer NOT NULL,
	`lease_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_source_structure_source_unique` ON `data_source_structure` (`data_source_id`);--> statement-breakpoint
CREATE INDEX `data_source_structure_state_next_attempt_idx` ON `data_source_structure` (`state`,`next_attempt_at`);