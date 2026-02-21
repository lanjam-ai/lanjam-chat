import { desc } from "drizzle-orm";
import type { Database } from "../client.js";
import { ownerAuditLog } from "../schema/owner-audit-log.js";

export class OwnerAuditLogRepository {
  constructor(private db: Database) {}

  async log(data: {
    action: string;
    target_user_id?: string;
    ip?: string;
    user_agent?: string;
  }) {
    const result = await this.db.insert(ownerAuditLog).values(data).returning();
    return result[0];
  }

  async list(limit = 50) {
    return this.db
      .select()
      .from(ownerAuditLog)
      .orderBy(desc(ownerAuditLog.created_at))
      .limit(limit);
  }
}
