import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { safetyRules } from "../schema/safety-rules.js";

export class SafetyRuleRepository {
  constructor(private db: Database) {}

  async getAll() {
    return this.db.select().from(safetyRules).orderBy(safetyRules.type);
  }

  async getByType(type: string) {
    const result = await this.db
      .select()
      .from(safetyRules)
      .where(eq(safetyRules.type, type))
      .limit(1);
    return result[0] ?? null;
  }

  async upsert(type: string, content: string, previousContent?: string | null) {
    const existing = await this.getByType(type);
    if (existing) {
      const result = await this.db
        .update(safetyRules)
        .set({
          content,
          previous_content: previousContent !== undefined ? previousContent : existing.content,
          updated_at: new Date(),
        })
        .where(eq(safetyRules.type, type))
        .returning();
      return result[0];
    }
    const result = await this.db
      .insert(safetyRules)
      .values({
        type,
        content,
        previous_content: previousContent ?? null,
      })
      .returning();
    return result[0];
  }
}
