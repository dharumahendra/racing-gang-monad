ALTER TABLE `runs` ADD `ended_at` integer;--> statement-breakpoint
CREATE INDEX `runs_leaderboard` ON `runs` (`result`,`near_misses`);