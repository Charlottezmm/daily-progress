CREATE TYPE "public"."agent_run_kind" AS ENUM('morning_rebalance', 'evening_review', 'weekly_rebalance');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('started', 'draft_created', 'no_change', 'duplicate', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_id" uuid,
	"patch_id" uuid,
	"kind" "agent_run_kind" NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"status" "agent_run_status" NOT NULL,
	"reason" text NOT NULL,
	"input_json" jsonb NOT NULL,
	"result_json" jsonb NOT NULL,
	"warnings_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_json" jsonb,
	"created_by" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_patch_id_agent_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."agent_patches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_runs_workspace_idempotency_unique" ON "agent_runs" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_workspace_created_idx" ON "agent_runs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_workspace_status_idx" ON "agent_runs" USING btree ("workspace_id","status");