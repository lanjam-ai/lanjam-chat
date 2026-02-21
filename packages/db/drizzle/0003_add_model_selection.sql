-- Add role-based access columns to llm_models
ALTER TABLE "llm_models" ADD COLUMN "allow_teen" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "llm_models" ADD COLUMN "allow_child" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "llm_models" ADD COLUMN "safe_mode_allowed" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

-- Track selected model per conversation (null = use system default)
ALTER TABLE "conversations" ADD COLUMN "llm_model_id" uuid REFERENCES "llm_models"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- Track model used and response metadata per message
ALTER TABLE "messages" ADD COLUMN "llm_model_id" uuid REFERENCES "llm_models"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "metadata" jsonb;
