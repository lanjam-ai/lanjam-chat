import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { conversationGroups, conversations } from "../schema/conversations.js";
import { embeddings } from "../schema/embeddings.js";
import { files } from "../schema/files.js";
import { messages } from "../schema/messages.js";
import { conversationTags, tags } from "../schema/tags.js";

export class ConversationRepository {
  constructor(private db: Database) {}

  async list(
    userId: string,
    opts?: {
      archived?: boolean;
      q?: string;
      tagNames?: string[];
      groupId?: string;
      ungrouped?: boolean;
    },
  ) {
    // Build one EXISTS clause per tag for AND filtering
    const tagFilters = (opts?.tagNames ?? []).map(
      (name) =>
        sql`EXISTS (
          SELECT 1 FROM conversation_tags ct
          JOIN tags t ON t.id = ct.tag_id
          WHERE ct.conversation_id = ${conversations.id}
            AND t.normalized_name = ${name.toLowerCase().trim()}
            AND t.user_id = ${userId}
        )`,
    );

    const query = this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.user_id, userId),
          opts?.archived !== undefined
            ? eq(conversations.is_archived, opts.archived)
            : eq(conversations.is_archived, false),
          opts?.groupId
            ? eq(conversations.group_id, opts.groupId)
            : opts?.ungrouped
              ? sql`${conversations.group_id} IS NULL`
              : undefined,
          opts?.q ? ilike(conversations.title, `%${opts.q}%`) : undefined,
          ...tagFilters,
        ),
      )
      .orderBy(desc(conversations.updated_at));

    const rows = await query;

    // Batch-fetch tags and group names for all conversations
    const convIds = rows.map((c) => c.id);
    const tagMap = new Map<string, { id: string; name: string }[]>();
    const groupMap = new Map<string, string>();

    if (convIds.length > 0) {
      const allTags = await this.db
        .select({
          conversation_id: conversationTags.conversation_id,
          tag_id: tags.id,
          tag_name: tags.name,
        })
        .from(conversationTags)
        .innerJoin(tags, eq(conversationTags.tag_id, tags.id))
        .where(sql`${conversationTags.conversation_id} IN ${convIds}`);

      for (const row of allTags) {
        const existing = tagMap.get(row.conversation_id) ?? [];
        existing.push({ id: row.tag_id, name: row.tag_name });
        tagMap.set(row.conversation_id, existing);
      }

      const groupIds = [...new Set(rows.filter((c) => c.group_id).map((c) => c.group_id!))];
      if (groupIds.length > 0) {
        const groups = await this.db
          .select({ id: conversationGroups.id, name: conversationGroups.name })
          .from(conversationGroups)
          .where(sql`${conversationGroups.id} IN ${groupIds}`);
        for (const g of groups) {
          groupMap.set(g.id, g.name);
        }
      }
    }

    return rows.map((c) => ({
      ...c,
      tags: tagMap.get(c.id) ?? [],
      group_name: c.group_id ? (groupMap.get(c.group_id) ?? null) : null,
    }));
  }

  async getById(userId: string, id: string) {
    const result = await this.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.user_id, userId)))
      .limit(1);
    return result[0] ?? null;
  }

  async create(
    userId: string,
    data: {
      title?: string;
      safe_mode?: boolean;
      safety_content?: string;
      llm_model_id?: string;
      group_id?: string | null;
    },
  ) {
    const result = await this.db
      .insert(conversations)
      .values({
        user_id: userId,
        title: data.title ?? "New conversation",
        safe_mode: data.safe_mode ?? null,
        safety_content: data.safety_content ?? null,
        llm_model_id: data.llm_model_id ?? null,
        group_id: data.group_id ?? null,
      })
      .returning();
    return result[0];
  }

  async update(
    userId: string,
    id: string,
    data: Partial<{
      title: string;
      is_archived: boolean;
      group_id: string | null;
      safe_mode: boolean;
      safety_content: string | null;
      llm_model_id: string | null;
    }>,
  ) {
    const result = await this.db
      .update(conversations)
      .set({ ...data, updated_at: new Date() })
      .where(and(eq(conversations.id, id), eq(conversations.user_id, userId)))
      .returning();
    return result[0] ?? null;
  }

  /**
   * Search across conversation titles and message content.
   * Uses ILIKE for reliable matching + optional FTS for relevance ranking.
   */
  async searchContent(userId: string, query: string, limit = 20) {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const pattern = `%${trimmed}%`;

    const result = await this.db.execute(sql`
      SELECT
        c.id,
        c.title,
        c.is_archived,
        c.updated_at,
        c.created_at,
        (
          SELECT substring(
            m.content,
            GREATEST(1, position(lower(${trimmed}) in lower(m.content)) - 80),
            200
          )
          FROM messages m
          WHERE m.conversation_id = c.id
            AND m.content ILIKE ${pattern}
            AND (
              m.version_group_id IS NULL
              OR m.version_number = (
                SELECT MAX(m2.version_number) FROM messages m2
                WHERE m2.version_group_id = m.version_group_id
              )
            )
          LIMIT 1
        ) AS snippet,
        CASE
          WHEN c.title ILIKE ${pattern} THEN 2
          ELSE 1
        END AS relevance
      FROM conversations c
      WHERE c.user_id = ${userId}
        AND (
          c.title ILIKE ${pattern}
          OR EXISTS (
            SELECT 1 FROM messages m
            WHERE m.conversation_id = c.id
              AND m.content ILIKE ${pattern}
              AND (
                m.version_group_id IS NULL
                OR m.version_number = (
                  SELECT MAX(m2.version_number) FROM messages m2
                  WHERE m2.version_group_id = m.version_group_id
                )
              )
          )
        )
      ORDER BY relevance DESC, c.updated_at DESC
      LIMIT ${limit}
    `);

    return (result.rows ?? result) as Array<{
      id: string;
      title: string;
      is_archived: boolean;
      updated_at: string;
      created_at: string;
      snippet: string | null;
      relevance: number;
    }>;
  }

  async delete(userId: string, id: string) {
    // Cascade handles messages, files, embeddings, conversation_tags via FK
    const result = await this.db
      .delete(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.user_id, userId)))
      .returning();
    return result[0] ?? null;
  }
}
