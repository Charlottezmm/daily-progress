CREATE TYPE "public"."onboarding_event_type" AS ENUM('schedule_import_skipped', 'connector_setup_skipped', 'review_opened');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_onboarding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"event_type" "onboarding_event_type" NOT NULL,
	"metadata_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_onboarding_events" ADD CONSTRAINT "workspace_onboarding_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_onboarding_events_workspace_event_unique" ON "workspace_onboarding_events" USING btree ("workspace_id","event_type");
