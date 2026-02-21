import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { systemKv } from "../schema/system-kv.js";

export class SystemKvRepository {
  constructor(private db: Database) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const result = await this.db.select().from(systemKv).where(eq(systemKv.key, key)).limit(1);
    if (!result[0]) return null;
    return result[0].value_json as T;
  }

  async set(key: string, value: unknown) {
    await this.db
      .insert(systemKv)
      .values({ key, value_json: value, updated_at: new Date() })
      .onConflictDoUpdate({
        target: systemKv.key,
        set: { value_json: value, updated_at: new Date() },
      });
  }

  async delete(key: string) {
    await this.db.delete(systemKv).where(eq(systemKv.key, key));
  }
}
