import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../client.js";
import { files } from "../schema/files.js";
import { messageFiles } from "../schema/message-files.js";

export class MessageFileRepository {
  constructor(private db: Database) {}

  async linkMany(messageId: string, fileIds: string[]) {
    if (fileIds.length === 0) return;
    await this.db
      .insert(messageFiles)
      .values(fileIds.map((file_id) => ({ message_id: messageId, file_id })))
      .onConflictDoNothing();
  }

  async unlinkMany(messageId: string, fileIds: string[]) {
    if (fileIds.length === 0) return;
    await this.db
      .delete(messageFiles)
      .where(and(eq(messageFiles.message_id, messageId), inArray(messageFiles.file_id, fileIds)));
  }

  async listByMessages(messageIds: string[]) {
    if (messageIds.length === 0) return [];
    return this.db
      .select({
        message_id: messageFiles.message_id,
        file_id: files.id,
        original_filename: files.original_filename,
        extraction_status: files.extraction_status,
      })
      .from(messageFiles)
      .innerJoin(files, eq(messageFiles.file_id, files.id))
      .where(inArray(messageFiles.message_id, messageIds));
  }
}
