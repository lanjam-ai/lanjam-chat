import { and, eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { conversationTags, tags } from "../schema/tags.js";

export class TagRepository {
  constructor(private db: Database) {}

  async listByUser(userId: string) {
    return this.db.select().from(tags).where(eq(tags.user_id, userId)).orderBy(tags.name);
  }

  async create(userId: string, name: string) {
    const result = await this.db
      .insert(tags)
      .values({
        user_id: userId,
        name: name.trim(),
        normalized_name: name.toLowerCase().trim(),
      })
      .returning();
    return result[0];
  }

  async update(tagId: string, userId: string, name: string) {
    const result = await this.db
      .update(tags)
      .set({
        name: name.trim(),
        normalized_name: name.toLowerCase().trim(),
      })
      .where(and(eq(tags.id, tagId), eq(tags.user_id, userId)))
      .returning();
    return result[0] ?? null;
  }

  async delete(tagId: string, userId: string) {
    const result = await this.db
      .delete(tags)
      .where(and(eq(tags.id, tagId), eq(tags.user_id, userId)))
      .returning();
    return result.length > 0;
  }

  async getConversationTags(conversationId: string) {
    return this.db
      .select({
        id: tags.id,
        user_id: tags.user_id,
        name: tags.name,
        normalized_name: tags.normalized_name,
      })
      .from(conversationTags)
      .innerJoin(tags, eq(conversationTags.tag_id, tags.id))
      .where(eq(conversationTags.conversation_id, conversationId));
  }

  async setConversationTags(conversationId: string, tagIds: string[]) {
    await this.db
      .delete(conversationTags)
      .where(eq(conversationTags.conversation_id, conversationId));

    if (tagIds.length > 0) {
      await this.db.insert(conversationTags).values(
        tagIds.map((tagId) => ({
          conversation_id: conversationId,
          tag_id: tagId,
        })),
      );
    }
  }

  async addConversationTag(conversationId: string, tagId: string) {
    await this.db
      .insert(conversationTags)
      .values({ conversation_id: conversationId, tag_id: tagId })
      .onConflictDoNothing();
  }

  async removeConversationTag(conversationId: string, tagId: string) {
    await this.db
      .delete(conversationTags)
      .where(
        and(
          eq(conversationTags.conversation_id, conversationId),
          eq(conversationTags.tag_id, tagId),
        ),
      );
  }
}
