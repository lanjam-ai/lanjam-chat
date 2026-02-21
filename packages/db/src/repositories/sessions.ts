import { and, eq, lt } from "drizzle-orm";
import type { Database } from "../client.js";
import { sessions } from "../schema/sessions.js";
import { users } from "../schema/users.js";

export class SessionRepository {
  constructor(private db: Database) {}

  async create(data: {
    user_id: string;
    token_hash: string;
    expires_at: Date;
    user_agent?: string;
    ip?: string;
  }) {
    const result = await this.db.insert(sessions).values(data).returning();
    return result[0];
  }

  async findByTokenHash(tokenHash: string) {
    const result = await this.db
      .select({
        session: sessions,
        user: users,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.user_id, users.id))
      .where(eq(sessions.token_hash, tokenHash))
      .limit(1);
    return result[0] ?? null;
  }

  async updateLastSeen(id: string) {
    await this.db.update(sessions).set({ last_seen_at: new Date() }).where(eq(sessions.id, id));
  }

  async delete(id: string) {
    await this.db.delete(sessions).where(eq(sessions.id, id));
  }

  async deleteAllForUser(userId: string) {
    await this.db.delete(sessions).where(eq(sessions.user_id, userId));
  }

  async deleteExpired() {
    await this.db.delete(sessions).where(lt(sessions.expires_at, new Date()));
  }
}
