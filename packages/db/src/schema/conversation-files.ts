import { index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { files } from "./files";

export const conversationFiles = pgTable(
  "conversation_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversation_id: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    file_id: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("conversation_files_unique").on(table.conversation_id, table.file_id),
    index("conversation_files_conversation_idx").on(table.conversation_id),
    index("conversation_files_file_idx").on(table.file_id),
  ],
);
