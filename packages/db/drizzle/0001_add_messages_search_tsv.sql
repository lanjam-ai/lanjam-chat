-- Add full-text search vector column to messages (auto-maintained by PostgreSQL)
ALTER TABLE "messages"
  ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED;
--> statement-breakpoint

-- GIN index for fast full-text search
CREATE INDEX "messages_search_tsv_idx" ON "messages" USING gin ("search_tsv");
--> statement-breakpoint

-- Also add a tsvector + GIN index on conversation titles
ALTER TABLE "conversations"
  ADD COLUMN "title_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', "title")) STORED;
--> statement-breakpoint

CREATE INDEX "conversations_title_tsv_idx" ON "conversations" USING gin ("title_tsv");
