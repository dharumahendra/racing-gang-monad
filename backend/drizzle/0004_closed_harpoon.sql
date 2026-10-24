DROP INDEX `runs_leaderboard`;--> statement-breakpoint
CREATE INDEX `runs_leaderboard_v2` ON `runs` ("near_misses" DESC,`ended_at`) WHERE "runs"."result" IN ('VERIFIED', 'PARTIAL');