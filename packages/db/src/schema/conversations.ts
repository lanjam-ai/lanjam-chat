import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { llmModels } from "./llm-models";
import { users } from "./users";

export const conversationGroups = pgTable(
  "conversation_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    guidance_text: text("guidance_text"),
  },
  (table) => [index("conversation_groups_user_id_idx").on(table.user_id)],
);
// Note: unique(user_id, name) is handled via unique constraint

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    is_archived: boolean("is_archived").notNull().default(false),
    group_id: uuid("group_id").references(() => conversationGroups.id, { onDelete: "set null" }),
    safe_mode: boolean("safe_mode"),
    safety_content: text("safety_content"),
    llm_model_id: uuid("llm_model_id").references(() => llmModels.id, { onDelete: "set null" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("conversations_user_id_idx").on(table.user_id),
    index("conversations_user_archived_idx").on(table.user_id, table.is_archived),
    index("conversations_updated_at_idx").on(table.updated_at),
  ],
);
