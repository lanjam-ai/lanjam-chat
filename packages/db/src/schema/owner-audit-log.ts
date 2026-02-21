import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const ownerAuditLog = pgTable(
  "owner_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    action: text("action").notNull(),
    target_user_id: uuid("target_user_id"),
    ip: text("ip"),
    user_agent: text("user_agent"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("owner_audit_log_created_at_idx").on(table.created_at)],
);
