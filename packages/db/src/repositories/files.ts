import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../client.js";
import { files } from "../schema/files.js";

export class FileRepository {
  constructor(private db: Database) {}

  async create(data: {
    user_id: string;
    original_filename: string;
    mime_type: string;
    size_bytes: number;
    crc32?: string;
    minio_object_key: string;
  }) {
    const result = await this.db.insert(files).values(data).returning();
    return result[0];
  }

  async getById(userId: string, fileId: string) {
    const result = await this.db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.user_id, userId)))
      .limit(1);
    return result[0] ?? null;
  }

  async findByCrc(userId: string, crc32: string) {
    const result = await this.db
      .select()
      .from(files)
      .where(and(eq(files.user_id, userId), eq(files.crc32, crc32)))
      .limit(1);
    return result[0] ?? null;
  }

  async getByIds(userId: string, fileIds: string[]) {
    if (fileIds.length === 0) return [];
    return this.db
      .select()
      .from(files)
      .where(and(eq(files.user_id, userId), inArray(files.id, fileIds)));
  }

  async listByUser(userId: string) {
    return this.db.select().from(files).where(eq(files.user_id, userId));
  }

  async updateExtractionStatus(
    userId: string,
    fileId: string,
    data: {
      extraction_status: "pending" | "done" | "failed";
      extracted_text_object_key?: string;
      extracted_text_preview?: string;
    },
  ) {
    const result = await this.db
      .update(files)
      .set(data)
      .where(and(eq(files.id, fileId), eq(files.user_id, userId)))
      .returning();
    return result[0] ?? null;
  }

  async delete(userId: string, fileId: string) {
    const result = await this.db
      .delete(files)
      .where(and(eq(files.id, fileId), eq(files.user_id, userId)))
      .returning();
    return result[0] ?? null;
  }
}
