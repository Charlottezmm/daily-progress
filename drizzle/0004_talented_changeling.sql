CREATE TABLE IF NOT EXISTS "agent_patch_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"patch_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"accepted_operation_indexes" jsonb NOT NULL,
	"rejected_operation_indexes" jsonb NOT NULL,
	"skipped_json" jsonb NOT NULL,
	"conflict_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_patch_reviews" ADD CONSTRAINT "agent_patch_reviews_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_patch_reviews" ADD CONSTRAINT "agent_patch_reviews_patch_id_agent_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."agent_patches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_patch_reviews" ADD CONSTRAINT "agent_patch_reviews_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_patch_reviews_workspace_patch_idx" ON "agent_patch_reviews" USING btree ("workspace_id","patch_id");