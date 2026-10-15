CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`actor_id` text NOT NULL,
	`actor_label` text NOT NULL,
	`event` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text,
	`target_label` text,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `audit_log_organization_occurred_idx` ON `audit_log` (`organization_id`,`occurred_at`);