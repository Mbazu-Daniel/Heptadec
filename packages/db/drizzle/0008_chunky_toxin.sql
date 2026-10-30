CREATE TABLE `scheduler_lease` (
	`name` text PRIMARY KEY NOT NULL,
	`lease_until` integer NOT NULL
);
