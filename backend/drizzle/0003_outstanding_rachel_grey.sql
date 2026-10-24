ALTER TABLE `users` ADD `privy_did` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_privy_did_unique` ON `users` (`privy_did`);