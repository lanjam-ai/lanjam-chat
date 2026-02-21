import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { messageRoleEnum } from "./enums";
import { llmModels } from "./llm-models";
import { users } from "./users";

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversation_id: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    llm_model_id: uuid("llm_model_id").references(() => llmModels.id, { onDelete: "set null" }),
    metadata: jsonb("metadata"),
    version_group_id: uuid("version_group_id"),
    version_number: integer("version_number").notNull().default(1),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("messages_conversation_id_idx").on(table.conversation_id),
    index("messages_user_id_idx").on(table.user_id),
    index("messages_created_at_idx").on(table.conversation_id, table.created_at),
  ],
);
