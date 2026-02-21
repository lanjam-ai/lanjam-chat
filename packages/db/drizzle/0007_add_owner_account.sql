CREATE TABLE IF NOT EXISTS "system_owner" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "passcode_hash" text NOT NULL,
  "recovery_key_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
-->statement-breakpoint
CREATE TABLE IF NOT EXISTS "owner_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "system_owner"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_agent" text,
  "ip" text
);
-->statement-breakpoint
CREATE INDEX "owner_sessions_owner_id_idx" ON "owner_sessions" ("owner_id");
-->statement-breakpoint
CREATE INDEX "owner_sessions_expires_at_idx" ON "owner_sessions" ("expires_at");
-->statement-breakpoint
CREATE TABLE IF NOT EXISTS "owner_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "action" text NOT NULL,
  "target_user_id" uuid,
  "ip" text,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
-->statement-breakpoint
CREATE INDEX "owner_audit_log_created_at_idx" ON "owner_audit_log" ("created_at");
