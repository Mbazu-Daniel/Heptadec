PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_data_source` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`host` text,
	`port` integer,
	`socket_path` text,
	`connection_mode` text,
	`database` text,
	`schema_name` text,
	`options` text,
	`username` text,
	`secret` text,
	`ca_certificate` text,
	`client_certificate` text,
	`client_key` text,
	`token` text,
	`read_only` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_data_source`("id", "organization_id", "kind", "name", "host", "port", "socket_path", "connection_mode", "database", "schema_name", "options", "username", "secret", "ca_certificate", "client_certificate", "client_key", "token", "read_only", "created_at", "updated_at") SELECT "id", "organization_id", "kind", "name", "host", "port", "socket_path", "connection_mode", "database", "schema_name", "options", "username", "secret", "ca_certificate", "client_certificate", "client_key", "token", "read_only", "created_at", "updated_at" FROM `data_source`;--> statement-breakpoint
DROP TABLE `data_source`;--> statement-breakpoint
ALTER TABLE `__new_data_source` RENAME TO `data_source`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `data_source_organization_created_idx` ON `data_source` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_saved_query` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`data_source_id` text NOT NULL,
	`name` text NOT NULL,
	`sql` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_saved_query`("id", "organization_id", "data_source_id", "name", "sql", "created_at", "updated_at") SELECT "id", "organization_id", "data_source_id", "name", "sql", "created_at", "updated_at" FROM `saved_query`;--> statement-breakpoint
DROP TABLE `saved_query`;--> statement-breakpoint
ALTER TABLE `__new_saved_query` RENAME TO `saved_query`;--> statement-breakpoint
CREATE INDEX `saved_query_source_created_idx` ON `saved_query` (`data_source_id`,`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `saved_query_organization_created_idx` ON `saved_query` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_query_version` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`saved_query_id` text NOT NULL,
	`name` text NOT NULL,
	`sql` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_query_version`("id", "organization_id", "saved_query_id", "name", "sql", "created_at") SELECT "id", "organization_id", "saved_query_id", "name", "sql", "created_at" FROM `query_version`;--> statement-breakpoint
DROP TABLE `query_version`;--> statement-breakpoint
ALTER TABLE `__new_query_version` RENAME TO `query_version`;--> statement-breakpoint
CREATE INDEX `query_version_saved_query_created_idx` ON `query_version` (`saved_query_id`,`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_dashboard` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_dashboard`("id", "organization_id", "name", "created_at", "updated_at") SELECT "id", "organization_id", "name", "created_at", "updated_at" FROM `dashboard`;--> statement-breakpoint
DROP TABLE `dashboard`;--> statement-breakpoint
ALTER TABLE `__new_dashboard` RENAME TO `dashboard`;--> statement-breakpoint
CREATE INDEX `dashboard_organization_created_idx` ON `dashboard` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_dashboard_data_source` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`dashboard_id` text NOT NULL,
	`data_source_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_dashboard_data_source`("id", "organization_id", "dashboard_id", "data_source_id", "created_at") SELECT "id", "organization_id", "dashboard_id", "data_source_id", "created_at" FROM `dashboard_data_source`;--> statement-breakpoint
DROP TABLE `dashboard_data_source`;--> statement-breakpoint
ALTER TABLE `__new_dashboard_data_source` RENAME TO `dashboard_data_source`;--> statement-breakpoint
CREATE UNIQUE INDEX `dashboard_data_source_unique` ON `dashboard_data_source` (`dashboard_id`,`data_source_id`);--> statement-breakpoint
CREATE TABLE `__new_widget` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`dashboard_id` text NOT NULL,
	`saved_query_id` text NOT NULL,
	`chart_type` text NOT NULL,
	`title` text NOT NULL,
	`label_column` text NOT NULL,
	`value_column` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_widget`("id", "organization_id", "dashboard_id", "saved_query_id", "chart_type", "title", "label_column", "value_column", "created_at", "updated_at") SELECT "id", "organization_id", "dashboard_id", "saved_query_id", "chart_type", "title", "label_column", "value_column", "created_at", "updated_at" FROM `widget`;--> statement-breakpoint
DROP TABLE `widget`;--> statement-breakpoint
ALTER TABLE `__new_widget` RENAME TO `widget`;--> statement-breakpoint
CREATE INDEX `widget_dashboard_created_idx` ON `widget` (`dashboard_id`,`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_share_link` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`dashboard_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`snapshot` text NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_share_link`("id", "organization_id", "dashboard_id", "token_hash", "snapshot", "expires_at", "created_at", "updated_at") SELECT "id", "organization_id", "dashboard_id", "token_hash", "snapshot", "expires_at", "created_at", "updated_at" FROM `share_link`;--> statement-breakpoint
DROP TABLE `share_link`;--> statement-breakpoint
ALTER TABLE `__new_share_link` RENAME TO `share_link`;--> statement-breakpoint
CREATE INDEX `share_link_token_hash_idx` ON `share_link` (`token_hash`);--> statement-breakpoint
CREATE INDEX `share_link_dashboard_created_idx` ON `share_link` (`dashboard_id`,`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_scheduled_job` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`saved_query_id` text NOT NULL,
	`name` text NOT NULL,
	`cron` text NOT NULL,
	`timezone` text NOT NULL,
	`ttl_seconds` integer NOT NULL,
	`next_run_at` integer NOT NULL,
	`lease_until` integer,
	`last_run_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_scheduled_job`("id", "organization_id", "saved_query_id", "name", "cron", "timezone", "ttl_seconds", "next_run_at", "lease_until", "last_run_at", "created_at", "updated_at") SELECT "id", "organization_id", "saved_query_id", "name", "cron", "timezone", "ttl_seconds", "next_run_at", "lease_until", "last_run_at", "created_at", "updated_at" FROM `scheduled_job`;--> statement-breakpoint
DROP TABLE `scheduled_job`;--> statement-breakpoint
ALTER TABLE `__new_scheduled_job` RENAME TO `scheduled_job`;--> statement-breakpoint
CREATE INDEX `scheduled_job_next_run_idx` ON `scheduled_job` (`next_run_at`);--> statement-breakpoint
CREATE INDEX `scheduled_job_organization_idx` ON `scheduled_job` (`organization_id`);--> statement-breakpoint
CREATE TABLE `__new_query_result` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`saved_query_id` text NOT NULL,
	`ran_at` integer NOT NULL,
	`ttl_seconds` integer NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_query_result`("id", "organization_id", "saved_query_id", "ran_at", "ttl_seconds", "payload") SELECT "id", "organization_id", "saved_query_id", "ran_at", "ttl_seconds", "payload" FROM `query_result`;--> statement-breakpoint
DROP TABLE `query_result`;--> statement-breakpoint
ALTER TABLE `__new_query_result` RENAME TO `query_result`;--> statement-breakpoint
CREATE INDEX `query_result_saved_query_ran_idx` ON `query_result` (`saved_query_id`,`ran_at`);--> statement-breakpoint
CREATE TABLE `__new_alert_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`saved_query_id` text NOT NULL,
	`name` text NOT NULL,
	`column` text NOT NULL,
	`operator` text NOT NULL,
	`threshold` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_alert_rule`("id", "organization_id", "saved_query_id", "name", "column", "operator", "threshold", "created_at", "updated_at") SELECT "id", "organization_id", "saved_query_id", "name", "column", "operator", "threshold", "created_at", "updated_at" FROM `alert_rule`;--> statement-breakpoint
DROP TABLE `alert_rule`;--> statement-breakpoint
ALTER TABLE `__new_alert_rule` RENAME TO `alert_rule`;--> statement-breakpoint
CREATE INDEX `alert_rule_saved_query_idx` ON `alert_rule` (`saved_query_id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `alert_rule_organization_created_idx` ON `alert_rule` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_alert_delivery` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`alert_rule_id` text NOT NULL,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_alert_delivery`("id", "organization_id", "alert_rule_id", "channel", "status", "message", "error", "created_at") SELECT "id", "organization_id", "alert_rule_id", "channel", "status", "message", "error", "created_at" FROM `alert_delivery`;--> statement-breakpoint
DROP TABLE `alert_delivery`;--> statement-breakpoint
ALTER TABLE `__new_alert_delivery` RENAME TO `alert_delivery`;--> statement-breakpoint
CREATE INDEX `alert_delivery_organization_created_idx` ON `alert_delivery` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`actor_id` text NOT NULL,
	`actor_label` text NOT NULL,
	`event` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text,
	`target_label` text,
	`detail` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_audit_log`("id", "organization_id", "occurred_at", "actor_id", "actor_label", "event", "target_kind", "target_id", "target_label", "detail") SELECT "id", "organization_id", "occurred_at", "actor_id", "actor_label", "event", "target_kind", "target_id", "target_label", "detail" FROM `audit_log`;--> statement-breakpoint
DROP TABLE `audit_log`;--> statement-breakpoint
ALTER TABLE `__new_audit_log` RENAME TO `audit_log`;--> statement-breakpoint
CREATE INDEX `audit_log_organization_occurred_idx` ON `audit_log` (`organization_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `__new_ai_provider` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`base_url` text,
	`api_key` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_ai_provider`("id", "organization_id", "name", "provider", "model", "base_url", "api_key", "is_default", "created_at", "updated_at") SELECT "id", "organization_id", "name", "provider", "model", "base_url", "api_key", "is_default", "created_at", "updated_at" FROM `ai_provider`;--> statement-breakpoint
DROP TABLE `ai_provider`;--> statement-breakpoint
ALTER TABLE `__new_ai_provider` RENAME TO `ai_provider`;--> statement-breakpoint
CREATE INDEX `ai_provider_organization_created_idx` ON `ai_provider` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_provider_organization_provider_idx` ON `ai_provider` (`organization_id`,`provider`);--> statement-breakpoint
CREATE TABLE `__new_ai_chat` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`data_source_id` text NOT NULL,
	`provider_name` text NOT NULL,
	`model` text NOT NULL,
	`question` text NOT NULL,
	`sql` text,
	`problem` text,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_ai_chat`("id", "organization_id", "data_source_id", "provider_name", "model", "question", "sql", "problem", "duration_ms", "created_at") SELECT "id", "organization_id", "data_source_id", "provider_name", "model", "question", "sql", "problem", "duration_ms", "created_at" FROM `ai_chat`;--> statement-breakpoint
DROP TABLE `ai_chat`;--> statement-breakpoint
ALTER TABLE `__new_ai_chat` RENAME TO `ai_chat`;--> statement-breakpoint
CREATE TABLE `__new_notification_channel` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`recipients` text NOT NULL,
	`config` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_notification_channel`("id", "organization_id", "name", "kind", "recipients", "config", "created_at", "updated_at") SELECT "id", "organization_id", "name", "kind", "recipients", "config", "created_at", "updated_at" FROM `notification_channel`;--> statement-breakpoint
DROP TABLE `notification_channel`;--> statement-breakpoint
ALTER TABLE `__new_notification_channel` RENAME TO `notification_channel`;--> statement-breakpoint
CREATE INDEX `notification_channel_organization_created_idx` ON `notification_channel` (`organization_id`,`created_at`);