import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const systemKv = pgTable("system_kv", {
  key: text("key").primaryKey(),
  value_json: jsonb("value_json").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
