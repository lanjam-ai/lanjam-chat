import { index, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { llmModels } from "./llm-models";
import { users } from "./users";

export const userModelAcknowledgments = pgTable(
  "user_model_acknowledgments",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    llm_model_id: uuid("llm_model_id")
      .notNull()
      .references(() => llmModels.id, { onDelete: "cascade" }),
    acknowledged_at: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.llm_model_id] }),
    index("user_model_ack_user_idx").on(table.user_id),
  ],
);
