import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { embeddings } from "../schema/embeddings.js";

export class EmbeddingRepository {
  constructor(private db: Database) {}

  async createMany(
    items: Array<{
      user_id: string;
      conversation_id?: string | null;
      source_type: "message" | "file_chunk";
      source_id: string;
      chunk_index: number;
      content: string;
      embedding: number[];
    }>,
  ) {
    if (items.length === 0) return;
    await this.db.insert(embeddings).values(items);
  }

  async searchByVector(
    userId: string,
    queryEmbedding: number[],
    opts?: {
      conversationId?: string;
      fileIds?: string[];
      limit?: number;
    },
  ) {
    const limit = opts?.limit ?? 8;
    const vectorStr = `[${queryEmbedding.join(",")}]`;

    const conditions = [sql`${embeddings.user_id} = ${userId}`];

    if (opts?.conversationId && opts?.fileIds && opts.fileIds.length > 0) {
      // Search both conversation-scoped message embeddings AND file chunk embeddings
      const fileIdList = opts.fileIds.map((id) => sql`${id}`);
      conditions.push(
        sql`(
          (${embeddings.source_type} = 'message' AND ${embeddings.conversation_id} = ${opts.conversationId})
          OR (${embeddings.source_type} = 'file_chunk' AND ${embeddings.source_id} IN (${sql.join(fileIdList, sql`, `)}))
        )`,
      );
    } else if (opts?.conversationId) {
      conditions.push(sql`${embeddings.conversation_id} = ${opts.conversationId}`);
    } else if (opts?.fileIds && opts.fileIds.length > 0) {
      const fileIdList = opts.fileIds.map((id) => sql`${id}`);
      conditions.push(
        sql`${embeddings.source_type} = 'file_chunk' AND ${embeddings.source_id} IN (${sql.join(fileIdList, sql`, `)})`,
      );
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const result = await this.db.execute(sql`
      SELECT id, conversation_id, source_type, source_id, chunk_index, content,
             embedding <=> ${vectorStr}::vector AS distance
      FROM embeddings
      WHERE ${whereClause}
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `);

    return result.rows as Array<{
      id: string;
      conversation_id: string | null;
      source_type: string;
      source_id: string;
      chunk_index: number;
      content: string;
      distance: number;
    }>;
  }

  async deleteByConversation(userId: string, conversationId: string) {
    await this.db
      .delete(embeddings)
      .where(
        and(
          eq(embeddings.user_id, userId),
          eq(embeddings.conversation_id, conversationId),
          eq(embeddings.source_type, "message"),
        ),
      );
  }

  async deleteBySource(userId: string, sourceType: "message" | "file_chunk", sourceId: string) {
    await this.db
      .delete(embeddings)
      .where(
        and(
          eq(embeddings.user_id, userId),
          eq(embeddings.source_type, sourceType),
          eq(embeddings.source_id, sourceId),
        ),
      );
  }
}
