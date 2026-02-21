import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const llmModels = pgTable("llm_models", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  host: text("host"),
  is_installed: boolean("is_installed").notNull().default(false),
  is_active: boolean("is_active").notNull().default(false),
  allow_teen: boolean("allow_teen").notNull().default(false),
  allow_child: boolean("allow_child").notNull().default(false),
  safe_mode_allowed: boolean("safe_mode_allowed").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
