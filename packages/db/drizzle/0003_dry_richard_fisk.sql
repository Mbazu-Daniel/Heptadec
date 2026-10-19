CREATE TABLE `billing_subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`product_id` text NOT NULL,
	`status` text NOT NULL,
	`current_period_end` integer,
	`cancel_at_period_end` integer NOT NULL,
	`event_created_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_subscription_organization_id_unique` ON `billing_subscription` (`organization_id`);