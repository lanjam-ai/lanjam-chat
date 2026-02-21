import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const systemOwner = pgTable("system_owner", {
  id: uuid("id").defaultRandom().primaryKey(),
  passcode_hash: text("passcode_hash").notNull(),
  recovery_key_hash: text("recovery_key_hash").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
