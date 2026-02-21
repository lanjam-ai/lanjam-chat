import { eq, lt } from "drizzle-orm";
import type { Database } from "../client.js";
import { ownerSessions } from "../schema/owner-sessions.js";

export class OwnerSessionRepository {
  constructor(private db: Database) {}

  async create(data: {
    owner_id: string;
    token_hash: string;
    expires_at: Date;
    user_agent?: string;
    ip?: string;
  }) {
    const result = await this.db.insert(ownerSessions).values(data).returning();
    return result[0];
  }

  async findByTokenHash(tokenHash: string) {
    const result = await this.db
      .select()
      .from(ownerSessions)
      .where(eq(ownerSessions.token_hash, tokenHash))
      .limit(1);
    return result[0] ?? null;
  }

  async updateLastSeen(id: string) {
    await this.db
      .update(ownerSessions)
      .set({ last_seen_at: new Date() })
      .where(eq(ownerSessions.id, id));
  }

  async delete(id: string) {
    await this.db.delete(ownerSessions).where(eq(ownerSessions.id, id));
  }

  async deleteExpired() {
    await this.db.delete(ownerSessions).where(lt(ownerSessions.expires_at, new Date()));
  }
}
