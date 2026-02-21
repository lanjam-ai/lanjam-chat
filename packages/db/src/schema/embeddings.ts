import { customType, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { embeddingSourceTypeEnum } from "./enums";
import { users } from "./users";

// Custom pgvector type
const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return "vector(768)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    // Parse "[1,2,3]" format from postgres
    return JSON.parse(value);
  },
});

export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversation_id: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "cascade",
    }),
    source_type: embeddingSourceTypeEnum("source_type").notNull(),
    source_id: uuid("source_id").notNull(),
    chunk_index: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("embeddings_user_conversation_idx").on(table.user_id, table.conversation_id),
    index("embeddings_source_idx").on(table.source_type, table.source_id),
  ],
);
