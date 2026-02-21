import { index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { files } from "./files";
import { messages } from "./messages";

export const messageFiles = pgTable(
  "message_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    message_id: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    file_id: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("message_files_unique").on(table.message_id, table.file_id),
    index("message_files_message_idx").on(table.message_id),
    index("message_files_file_idx").on(table.file_id),
  ],
);
