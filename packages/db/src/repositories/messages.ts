import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import type { Database } from "../client.js";
import { conversations } from "../schema/conversations.js";
import { messages } from "../schema/messages.js";

export class MessageRepository {
  constructor(private db: Database) {}

  async listByConversation(userId: string, conversationId: string) {
    // First verify conversation ownership
    const conv = await this.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.user_id, userId)))
      .limit(1);

    if (!conv[0]) return null;

    return this.db
      .select()
      .from(messages)
      .where(eq(messages.conversation_id, conversationId))
      .orderBy(asc(messages.created_at));
  }

  async create(
    userId: string,
    conversationId: string,
    data: {
      role: "system" | "user" | "assistant" | "tool";
      content: string;
      llm_model_id?: string | null;
      metadata?: Record<string, unknown> | null;
      version_group_id?: string | null;
      version_number?: number;
    },
  ) {
    const result = await this.db
      .insert(messages)
      .values({
        user_id: userId,
        conversation_id: conversationId,
        role: data.role,
        content: data.content,
        llm_model_id: data.llm_model_id ?? null,
        metadata: data.metadata ?? null,
        version_group_id: data.version_group_id ?? null,
        version_number: data.version_number ?? 1,
      })
      .returning();

    // Update conversation's updated_at
    await this.db
      .update(conversations)
      .set({ updated_at: new Date() })
      .where(eq(conversations.id, conversationId));

    return result[0];
  }

  async getById(userId: string, messageId: string) {
    const result = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.user_id, userId)))
      .limit(1);
    return result[0] ?? null;
  }

  /** Set version_group_id on a message (used to retroactively group old messages during edit). */
  async setVersionGroup(messageId: string, versionGroupId: string, versionNumber: number) {
    await this.db
      .update(messages)
      .set({ version_group_id: versionGroupId, version_number: versionNumber })
      .where(eq(messages.id, messageId));
  }

  /** Get the highest version number in a version group. */
  async getMaxVersionNumber(versionGroupId: string): Promise<number> {
    const result = await this.db
      .select({ version_number: messages.version_number })
      .from(messages)
      .where(eq(messages.version_group_id, versionGroupId))
      .orderBy(desc(messages.version_number))
      .limit(1);
    return result[0]?.version_number ?? 0;
  }

  /** Delete a single message by ID. Verifies ownership. Returns the deleted message or null. */
  async deleteById(userId: string, messageId: string) {
    const msg = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.user_id, userId)))
      .limit(1);

    if (!msg[0]) return null;

    await this.db.delete(messages).where(eq(messages.id, msg[0].id));
    return msg[0];
  }

  /** Delete the most recent message in a conversation. Returns the deleted message or null. */
  async deleteLast(userId: string, conversationId: string) {
    const conv = await this.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.user_id, userId)))
      .limit(1);

    if (!conv[0]) return null;

    const last = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversation_id, conversationId))
      .orderBy(desc(messages.created_at))
      .limit(1);

    if (!last[0]) return null;

    await this.db.delete(messages).where(eq(messages.id, last[0].id));
    return last[0];
  }

  /** Delete the last user question and all associated assistant responses.
   *  If the message belongs to a version group, all versions in that group are deleted.
   *  Returns the number of deleted messages, or null if conversation not found. */
  async deleteLastExchange(userId: string, conversationId: string): Promise<number | null> {
    const conv = await this.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.user_id, userId)))
      .limit(1);

    if (!conv[0]) return null;

    // Find the last user message
    const lastUser = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.conversation_id, conversationId), eq(messages.role, "user")))
      .orderBy(desc(messages.created_at))
      .limit(1);

    if (!lastUser[0]) return 0;

    if (lastUser[0].version_group_id) {
      // Delete all messages in the version group (all Q&A versions)
      const deleted = await this.db
        .delete(messages)
        .where(eq(messages.version_group_id, lastUser[0].version_group_id))
        .returning({ id: messages.id });
      return deleted.length;
    }

    // No version group — delete this user message + all assistant messages after it
    const toDelete = await this.db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversation_id, conversationId),
          gte(messages.created_at, lastUser[0].created_at),
        ),
      );

    if (toDelete.length === 0) return 0;

    const ids = toDelete.map((m) => m.id);
    await this.db.delete(messages).where(inArray(messages.id, ids));
    return ids.length;
  }
}
