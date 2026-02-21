-- Add version tracking to messages for edit/resubmit support
ALTER TABLE "messages" ADD COLUMN "version_group_id" uuid;
ALTER TABLE "messages" ADD COLUMN "version_number" integer NOT NULL DEFAULT 1;

-- Index for efficient version group lookups
CREATE INDEX "messages_version_group_id_idx" ON "messages" ("version_group_id") WHERE "version_group_id" IS NOT NULL;
