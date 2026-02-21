import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { userModelAcknowledgments } from "../schema/user-model-acknowledgments.js";

export class UserModelAcknowledgmentRepository {
  constructor(private db: Database) {}

  async getAcknowledgedModelIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ llm_model_id: userModelAcknowledgments.llm_model_id })
      .from(userModelAcknowledgments)
      .where(eq(userModelAcknowledgments.user_id, userId));
    return rows.map((r) => r.llm_model_id);
  }

  async acknowledge(userId: string, llmModelId: string): Promise<void> {
    await this.db
      .insert(userModelAcknowledgments)
      .values({ user_id: userId, llm_model_id: llmModelId })
      .onConflictDoNothing();
  }
}
