import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uiThemeEnum, userRoleEnum } from "./enums";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  role: userRoleEnum("role").notNull().default("adult"),
  passcode_hash: text("passcode_hash").notNull(),
  is_disabled: boolean("is_disabled").notNull().default(false),
  ui_theme: uiThemeEnum("ui_theme").notNull().default("system"),
  safe_mode_enabled: boolean("safe_mode_enabled").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
