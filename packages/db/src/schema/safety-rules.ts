import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const safetyRules = pgTable("safety_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: text("type").notNull().unique(),
  content: text("content").notNull(),
  previous_content: text("previous_content"),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
