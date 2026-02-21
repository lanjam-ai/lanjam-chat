import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { systemOwner } from "./system-owner";

export const ownerSessions = pgTable(
  "owner_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    owner_id: uuid("owner_id")
      .notNull()
      .references(() => systemOwner.id, { onDelete: "cascade" }),
    token_hash: text("token_hash").notNull().unique(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    last_seen_at: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    user_agent: text("user_agent"),
    ip: text("ip"),
  },
  (table) => [
    index("owner_sessions_owner_id_idx").on(table.owner_id),
    index("owner_sessions_expires_at_idx").on(table.expires_at),
  ],
);
