import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { systemOwner } from "../schema/system-owner.js";

export class SystemOwnerRepository {
  constructor(private db: Database) {}

  async find() {
    const result = await this.db.select().from(systemOwner).limit(1);
    return result[0] ?? null;
  }

  async create(data: { passcode_hash: string; recovery_key_hash: string }) {
    const result = await this.db.insert(systemOwner).values(data).returning();
    return result[0];
  }

  async updatePasscodeHash(id: string, passcode_hash: string) {
    const result = await this.db
      .update(systemOwner)
      .set({ passcode_hash, updated_at: new Date() })
      .where(eq(systemOwner.id, id))
      .returning();
    return result[0] ?? null;
  }

  async updateRecoveryKeyHash(id: string, recovery_key_hash: string) {
    const result = await this.db
      .update(systemOwner)
      .set({ recovery_key_hash, updated_at: new Date() })
      .where(eq(systemOwner.id, id))
      .returning();
    return result[0] ?? null;
  }
}
