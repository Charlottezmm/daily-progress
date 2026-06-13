CREATE TABLE IF NOT EXISTS "mcp_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"token_id" uuid,
	"tool_name" varchar(80) NOT NULL,
	"permission" "mcp_permission" NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mcp_usage_events" ADD CONSTRAINT "mcp_usage_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mcp_usage_events" ADD CONSTRAINT "mcp_usage_events_token_id_mcp_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."mcp_tokens"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_usage_events_workspace_created_idx" ON "mcp_usage_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_usage_events_workspace_tool_created_idx" ON "mcp_usage_events" USING btree ("workspace_id","tool_name","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_usage_events_token_idx" ON "mcp_usage_events" USING btree ("token_id");