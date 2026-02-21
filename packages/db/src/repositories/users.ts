import { eq, ilike, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { users } from "../schema/users.js";

export class UserRepository {
  constructor(private db: Database) {}

  async findById(id: string) {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0] ?? null;
  }

  async findByNameInsensitive(name: string) {
    const result = await this.db.select().from(users).where(ilike(users.name, name)).limit(1);
    return result[0] ?? null;
  }

  async listPublic() {
    return this.db
      .select({
        id: users.id,
        name: users.name,
        is_disabled: users.is_disabled,
      })
      .from(users)
      .orderBy(users.name);
  }

  async listAll() {
    return this.db.select().from(users).orderBy(users.name);
  }

  async create(data: {
    name: string;
    role: "admin" | "adult" | "teen" | "child";
    passcode_hash: string;
  }) {
    const result = await this.db.insert(users).values(data).returning();
    return result[0];
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      role: "admin" | "adult" | "teen" | "child";
      passcode_hash: string;
      is_disabled: boolean;
      ui_theme: "system" | "light" | "dark";
      safe_mode_enabled: boolean;
    }>,
  ) {
    const result = await this.db
      .update(users)
      .set({ ...data, updated_at: new Date() })
      .where(eq(users.id, id))
      .returning();
    return result[0] ?? null;
  }

  async delete(id: string) {
    const result = await this.db.delete(users).where(eq(users.id, id)).returning();
    return result[0] ?? null;
  }

  async count() {
    const result = await this.db.select({ count: sql<number>`count(*)` }).from(users);
    return Number(result[0].count);
  }
}
