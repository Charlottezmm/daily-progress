CREATE TABLE IF NOT EXISTS "claude_connector_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" varchar(160) NOT NULL,
	"client_name" varchar(180) DEFAULT 'Claude' NOT NULL,
	"access_token_hash" text NOT NULL,
	"permission" "mcp_permission" DEFAULT 'read_write' NOT NULL,
	"scope" text DEFAULT 'mcp' NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_authorization_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" varchar(160) NOT NULL,
	"code_hash" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" varchar(16) NOT NULL,
	"scope" text NOT NULL,
	"permission" "mcp_permission" DEFAULT 'read_write' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar(160) NOT NULL,
	"client_name" varchar(180) NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"grant_types" jsonb NOT NULL,
	"response_types" jsonb NOT NULL,
	"token_endpoint_auth_method" varchar(40) DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "claude_connector_authorizations" ADD CONSTRAINT "claude_connector_authorizations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "claude_connector_authorizations_access_token_hash_idx" ON "claude_connector_authorizations" USING btree ("access_token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "claude_connector_authorizations_workspace_created_idx" ON "claude_connector_authorizations" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_authorization_codes_code_hash_idx" ON "oauth_authorization_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_authorization_codes_workspace_client_idx" ON "oauth_authorization_codes" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_clients_client_id_unique" ON "oauth_clients" USING btree ("client_id");