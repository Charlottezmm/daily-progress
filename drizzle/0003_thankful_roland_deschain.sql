ALTER TYPE "public"."plan_version_source" ADD VALUE 'mcp';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_plan_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"import_key" varchar(160) NOT NULL,
	"created_by" varchar(40) NOT NULL,
	"source_label" varchar(120),
	"task_count" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"derived_task_ids" jsonb NOT NULL,
	"provenance_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mcp_plan_imports" ADD CONSTRAINT "mcp_plan_imports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mcp_plan_imports" ADD CONSTRAINT "mcp_plan_imports_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_plan_imports_workspace_id_import_key_unique" ON "mcp_plan_imports" USING btree ("workspace_id","import_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_plan_imports_workspace_id_plan_id_idx" ON "mcp_plan_imports" USING btree ("workspace_id","plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_tokens_token_hash_idx" ON "mcp_tokens" USING btree ("token_hash");