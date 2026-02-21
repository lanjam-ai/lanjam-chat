ALTER TABLE "conversation_groups" ADD COLUMN "guidance_text" text;
-->statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "normalized_name" text;
-->statement-breakpoint
UPDATE "tags" SET "normalized_name" = lower(trim("name"));
-->statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "normalized_name" SET NOT NULL;
-->statement-breakpoint
CREATE UNIQUE INDEX "tags_user_normalized_name_idx" ON "tags" ("user_id", "normalized_name");
-->statement-breakpoint
CREATE UNIQUE INDEX "conversation_groups_user_name_idx" ON "conversation_groups" ("user_id", lower("name"));
