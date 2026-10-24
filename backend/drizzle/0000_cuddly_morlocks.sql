CREATE TABLE `chain_cursor` (
	`name` text PRIMARY KEY NOT NULL,
	`last_block` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `coin_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`address` text NOT NULL,
	`delta` integer NOT NULL,
	`ref` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coin_ledger_ref_unique` ON `coin_ledger` (`ref`);--> statement-breakpoint
CREATE INDEX `coin_ledger_address` ON `coin_ledger` (`address`);--> statement-breakpoint
CREATE TABLE `disruptions` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`source` text NOT NULL,
	`kind` text NOT NULL,
	`lanes` text NOT NULL,
	`duration_index` integer,
	`warn_tick` integer NOT NULL,
	`sched_order` integer NOT NULL,
	`acked` integer DEFAULT false NOT NULL,
	`applied` integer,
	`spectator_nick` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `disruptions_run` ON `disruptions` (`run_id`);--> statement-breakpoint
CREATE TABLE `near_misses` (
	`run_id` text NOT NULL,
	`idx` integer NOT NULL,
	`tick` integer NOT NULL,
	`vehicle_id` integer NOT NULL,
	`vehicle_type` integer NOT NULL,
	`coins` integer NOT NULL,
	`input_hash` text NOT NULL,
	`tx_hash` text,
	`block_number` integer,
	`verified_at` integer NOT NULL,
	`recorded_at` integer,
	PRIMARY KEY(`run_id`, `idx`)
);
--> statement-breakpoint
CREATE TABLE `owned_cars` (
	`address` text NOT NULL,
	`tier` integer NOT NULL,
	`token_id` text NOT NULL,
	`run_id` text NOT NULL,
	`tx_hash` text NOT NULL,
	PRIMARY KEY(`address`, `tier`)
);
--> statement-breakpoint
CREATE TABLE `qualifications` (
	`address` text NOT NULL,
	`tier` integer NOT NULL,
	`run_id` text NOT NULL,
	`tx_hash` text NOT NULL,
	`block_number` integer NOT NULL,
	PRIMARY KEY(`address`, `tier`)
);
--> statement-breakpoint
CREATE TABLE `reservations` (
	`nonce` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`tier` integer NOT NULL,
	`coin_cost` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`status` text NOT NULL,
	`voucher_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reservations_address_status` ON `reservations` (`address`,`status`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`host_address` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `run_entries` (
	`run_id` text NOT NULL,
	`ord` integer NOT NULL,
	`tick` integer NOT NULL,
	`kind` integer NOT NULL,
	`data` integer NOT NULL,
	`source` text NOT NULL,
	`client_seq` integer,
	`disruption_id` text,
	PRIMARY KEY(`run_id`, `ord`)
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`car_tier` integer NOT NULL,
	`seed` text NOT NULL,
	`seed_block` integer NOT NULL,
	`room_code` text,
	`config_version` integer NOT NULL,
	`lifecycle` text NOT NULL,
	`result` text,
	`chain_status` text NOT NULL,
	`end_reason` text,
	`end_tick` integer,
	`near_misses` integer DEFAULT 0 NOT NULL,
	`final_hash` text,
	`start_at` integer,
	`created_at` integer NOT NULL,
	`flags` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `runs_address_created` ON `runs` (`address`,`created_at`);--> statement-breakpoint
CREATE INDEX `runs_lifecycle` ON `runs` (`lifecycle`);--> statement-breakpoint
CREATE TABLE `users` (
	`address` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
