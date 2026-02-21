import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { conversationFiles } from "../schema/conversation-files.js";
import { files } from "../schema/files.js";

export class ConversationFileRepository {
  constructor(private db: Database) {}

  async link(conversationId: string, fileId: string) {
    await this.db
      .insert(conversationFiles)
      .values({ conversation_id: conversationId, file_id: fileId })
      .onConflictDoNothing();
  }

  async unlink(conversationId: string, fileId: string) {
    await this.db
      .delete(conversationFiles)
      .where(
        and(
          eq(conversationFiles.conversation_id, conversationId),
          eq(conversationFiles.file_id, fileId),
        ),
      );
  }

  async listByConversation(userId: string, conversationId: string) {
    return this.db
      .select({
        id: files.id,
        original_filename: files.original_filename,
        mime_type: files.mime_type,
        size_bytes: files.size_bytes,
        extraction_status: files.extraction_status,
        created_at: files.created_at,
      })
      .from(conversationFiles)
      .innerJoin(files, eq(conversationFiles.file_id, files.id))
      .where(and(eq(conversationFiles.conversation_id, conversationId), eq(files.user_id, userId)));
  }

  async getFileIds(conversationId: string) {
    const rows = await this.db
      .select({ file_id: conversationFiles.file_id })
      .from(conversationFiles)
      .where(eq(conversationFiles.conversation_id, conversationId));
    return rows.map((r) => r.file_id);
  }

  async countReferences(fileId: string) {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(conversationFiles)
      .where(eq(conversationFiles.file_id, fileId));
    return result[0]?.count ?? 0;
  }

  async getFileIdsByConversation(conversationId: string) {
    const rows = await this.db
      .select({ file_id: conversationFiles.file_id })
      .from(conversationFiles)
      .where(eq(conversationFiles.conversation_id, conversationId));
    return rows.map((r) => r.file_id);
  }
}
