import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { extractionStatusEnum } from "./enums";
import { users } from "./users";

export const files = pgTable(
  "files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    original_filename: text("original_filename").notNull(),
    mime_type: text("mime_type").notNull(),
    size_bytes: bigint("size_bytes", { mode: "number" }).notNull(),
    crc32: text("crc32"),
    minio_object_key: text("minio_object_key").notNull().unique(),
    extracted_text_object_key: text("extracted_text_object_key"),
    extracted_text_preview: text("extracted_text_preview"),
    extraction_status: extractionStatusEnum("extraction_status").notNull().default("pending"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("files_user_id_idx").on(table.user_id),
    index("files_user_crc32_idx").on(table.user_id, table.crc32),
  ],
);
