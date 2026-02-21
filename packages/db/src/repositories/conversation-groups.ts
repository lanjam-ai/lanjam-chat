import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { conversationGroups, conversations } from "../schema/conversations.js";

export class ConversationGroupRepository {
  constructor(private db: Database) {}

  async listByUser(userId: string) {
    const rows = await this.db
      .select({
        id: conversationGroups.id,
        user_id: conversationGroups.user_id,
        name: conversationGroups.name,
        guidance_text: conversationGroups.guidance_text,
        conversation_count: sql<number>`(
          SELECT count(*)::int FROM conversations c
          WHERE c.group_id = conversation_groups.id
            AND c.is_archived = false
        )`,
      })
      .from(conversationGroups)
      .where(eq(conversationGroups.user_id, userId))
      .orderBy(conversationGroups.name);
    return rows;
  }

  async getById(userId: string, groupId: string) {
    const result = await this.db
      .select()
      .from(conversationGroups)
      .where(and(eq(conversationGroups.id, groupId), eq(conversationGroups.user_id, userId)))
      .limit(1);
    return result[0] ?? null;
  }

  async create(userId: string, name: string, guidanceText?: string) {
    const result = await this.db
      .insert(conversationGroups)
      .values({
        user_id: userId,
        name: name.trim(),
        guidance_text: guidanceText ?? null,
      })
      .returning();
    return result[0];
  }

  async update(
    userId: string,
    groupId: string,
    data: { name?: string; guidance_text?: string | null },
  ) {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.guidance_text !== undefined) updateData.guidance_text = data.guidance_text;

    if (Object.keys(updateData).length === 0) return this.getById(userId, groupId);

    const result = await this.db
      .update(conversationGroups)
      .set(updateData)
      .where(and(eq(conversationGroups.id, groupId), eq(conversationGroups.user_id, userId)))
      .returning();
    return result[0] ?? null;
  }

  async delete(userId: string, groupId: string) {
    const result = await this.db
      .delete(conversationGroups)
      .where(and(eq(conversationGroups.id, groupId), eq(conversationGroups.user_id, userId)))
      .returning();
    return result.length > 0;
  }
}
