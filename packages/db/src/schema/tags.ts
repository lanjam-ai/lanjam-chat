import { index, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { users } from "./users";

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalized_name: text("normalized_name").notNull(),
  },
  (table) => [index("tags_user_id_idx").on(table.user_id)],
);

export const conversationTags = pgTable(
  "conversation_tags",
  {
    conversation_id: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    tag_id: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.conversation_id, table.tag_id] })],
);
