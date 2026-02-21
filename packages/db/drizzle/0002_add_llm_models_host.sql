-- Add host column for remote Ollama server support (null = local)
ALTER TABLE "llm_models" ADD COLUMN "host" text;
--> statement-breakpoint

-- Replace unique(name) with composite unique on (name, host)
ALTER TABLE "llm_models" DROP CONSTRAINT "llm_models_name_unique";
--> statement-breakpoint

CREATE UNIQUE INDEX "llm_models_name_host_unique" ON "llm_models" (name, COALESCE(host, ''));
