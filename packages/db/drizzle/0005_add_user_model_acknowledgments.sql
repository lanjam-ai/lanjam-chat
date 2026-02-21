CREATE TABLE "user_model_acknowledgments" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "llm_model_id" uuid NOT NULL REFERENCES "llm_models"("id") ON DELETE CASCADE,
  "acknowledged_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "llm_model_id")
);
-->statement-breakpoint
CREATE INDEX "user_model_ack_user_idx" ON "user_model_acknowledgments" ("user_id");
