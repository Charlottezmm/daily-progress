ALTER TABLE "claude_connector_authorizations" ADD COLUMN "refresh_token_hash" text;--> statement-breakpoint
ALTER TABLE "claude_connector_authorizations" ADD COLUMN "refresh_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "claude_connector_authorizations_refresh_token_hash_idx" ON "claude_connector_authorizations" USING btree ("refresh_token_hash");