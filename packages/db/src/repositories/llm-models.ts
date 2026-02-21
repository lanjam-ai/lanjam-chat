import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { llmModels } from "../schema/llm-models.js";

function hostWhere(host: string | null | undefined) {
  return host ? eq(llmModels.host, host) : isNull(llmModels.host);
}

export class LlmModelRepository {
  constructor(private db: Database) {}

  async list() {
    return this.db.select().from(llmModels).orderBy(llmModels.name);
  }

  async getActive() {
    const result = await this.db
      .select()
      .from(llmModels)
      .where(eq(llmModels.is_active, true))
      .limit(1);
    return result[0] ?? null;
  }

  async setActive(name: string, host: string | null = null) {
    await this.db.transaction(async (tx) => {
      // Deactivate all
      await tx.update(llmModels).set({ is_active: false });
      // Activate the specified one
      await tx
        .update(llmModels)
        .set({ is_active: true, updated_at: new Date() })
        .where(and(eq(llmModels.name, name), hostWhere(host)));
    });
  }

  async listForUser(role: string, safeMode: boolean) {
    const all = await this.db
      .select()
      .from(llmModels)
      .where(eq(llmModels.is_installed, true))
      .orderBy(llmModels.name);

    return all.filter((m) => {
      if (role === "admin" || (role === "adult" && !safeMode)) return true;
      if (role === "adult" && safeMode) return m.safe_mode_allowed;
      if (role === "teen") return m.allow_teen;
      if (role === "child") return m.allow_child;
      return false;
    });
  }

  async findById(id: string) {
    const result = await this.db.select().from(llmModels).where(eq(llmModels.id, id)).limit(1);
    return result[0] ?? null;
  }

  async upsert(data: {
    name: string;
    host?: string | null;
    is_installed: boolean;
    is_active?: boolean;
    allow_teen?: boolean;
    allow_child?: boolean;
    safe_mode_allowed?: boolean;
  }) {
    const host = data.host ?? null;

    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(llmModels)
        .where(and(eq(llmModels.name, data.name), hostWhere(host)))
        .limit(1);

      if (existing[0]) {
        const updated = await tx
          .update(llmModels)
          .set({
            is_installed: data.is_installed,
            ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
            ...(data.allow_teen !== undefined ? { allow_teen: data.allow_teen } : {}),
            ...(data.allow_child !== undefined ? { allow_child: data.allow_child } : {}),
            ...(data.safe_mode_allowed !== undefined
              ? { safe_mode_allowed: data.safe_mode_allowed }
              : {}),
            updated_at: new Date(),
          })
          .where(eq(llmModels.id, existing[0].id))
          .returning();
        return updated[0];
      }

      const inserted = await tx
        .insert(llmModels)
        .values({
          name: data.name,
          host,
          is_installed: data.is_installed,
          is_active: data.is_active ?? false,
          allow_teen: data.allow_teen ?? false,
          allow_child: data.allow_child ?? false,
          safe_mode_allowed: data.safe_mode_allowed ?? true,
        })
        .returning();
      return inserted[0];
    });
  }

  async updateAccess(
    name: string,
    host: string | null,
    data: { allow_teen?: boolean; allow_child?: boolean; safe_mode_allowed?: boolean },
  ) {
    const result = await this.db
      .update(llmModels)
      .set({ ...data, updated_at: new Date() })
      .where(and(eq(llmModels.name, name), hostWhere(host)))
      .returning();
    return result[0] ?? null;
  }

  async delete(name: string, host: string | null = null) {
    await this.db.delete(llmModels).where(and(eq(llmModels.name, name), hostWhere(host)));
  }

  async findByName(name: string, host: string | null = null) {
    const result = await this.db
      .select()
      .from(llmModels)
      .where(and(eq(llmModels.name, name), hostWhere(host)))
      .limit(1);
    return result[0] ?? null;
  }
}
