import { crc32 } from "node:zlib";
import { createDefaultRegistry } from "@lanjam/file-extract";
import { ALLOWED_FILE_TYPES, MAX_UPLOAD_BYTES } from "@lanjam/utils";
import type { ApiContext } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { deleteObject, downloadObject, uploadObject } from "../services/minio.js";

export async function uploadFile(request: Request, ctx: ApiContext, conversationId: string) {
  const authCtx = await requireAuth(request, ctx);

  const conversation = await ctx.repos.conversations.getById(authCtx.userId, conversationId);
  if (!conversation) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Conversation not found" } },
      { status: 404 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "No file provided" } },
      { status: 400 },
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "File too large" } },
      { status: 400 },
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_FILE_TYPES.includes(ext as any)) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `File type ".${ext}" is not supported. Supported types: ${ALLOWED_FILE_TYPES.join(", ")}`,
        },
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Compute CRC32 for deduplication
  const crc32Hex = crc32(buffer).toString(16).padStart(8, "0");

  // Check for duplicate file by CRC
  const existingFile = await ctx.repos.files.findByCrc(authCtx.userId, crc32Hex);
  if (existingFile) {
    // File already exists — just link to this conversation
    await ctx.repos.conversationFiles.link(conversationId, existingFile.id);
    return Response.json({ file: existingFile, deduplicated: true }, { status: 201 });
  }

  // New file — create record and upload
  const fileRecord = await ctx.repos.files.create({
    user_id: authCtx.userId,
    original_filename: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    crc32: crc32Hex,
    minio_object_key: `user/${authCtx.userId}/file/${crypto.randomUUID()}/original`,
  });

  // Upload to MinIO
  await uploadObject(fileRecord.minio_object_key, buffer, file.type);

  // Link file to conversation
  await ctx.repos.conversationFiles.link(conversationId, fileRecord.id);

  // Process extraction in background (fire-and-forget)
  processFile(
    ctx,
    authCtx.userId,
    fileRecord.id,
    fileRecord.minio_object_key,
    buffer,
    file.name,
    file.type,
  ).catch((err) => console.error("File processing failed:", err));

  return Response.json({ file: fileRecord }, { status: 201 });
}

async function processFile(
  ctx: ApiContext,
  userId: string,
  fileId: string,
  objectKey: string,
  buffer: Buffer,
  filename: string,
  mimeType: string,
) {
  try {
    const registry = createDefaultRegistry();
    if (!registry.canExtract(mimeType, filename)) {
      await ctx.repos.files.updateExtractionStatus(userId, fileId, { extraction_status: "failed" });
      return;
    }

    const result = await registry.extract(buffer, mimeType, filename);

    // Check if extraction produced readable content
    if (result.text.trim().length === 0) {
      await ctx.repos.files.updateExtractionStatus(userId, fileId, { extraction_status: "failed" });
      return;
    }

    // Upload extracted text to MinIO
    const extractedKey = objectKey.replace("/original", "/extracted.txt");
    await uploadObject(extractedKey, Buffer.from(result.text, "utf-8"), "text/plain");

    // Store preview in DB for FTS (truncated to 200k chars)
    const preview = result.text.slice(0, 200_000);

    await ctx.repos.files.updateExtractionStatus(userId, fileId, {
      extraction_status: "done",
      extracted_text_object_key: extractedKey,
      extracted_text_preview: preview,
    });

    // Chunk and embed (user-level, no conversation_id)
    const { chunkText: chunk } = await import("@lanjam/utils");
    const chunks = chunk(result.text);

    const embeddingItems: Array<{
      user_id: string;
      source_type: "file_chunk";
      source_id: string;
      chunk_index: number;
      content: string;
      embedding: number[];
    }> = [];

    for (const c of chunks) {
      try {
        const { ollamaEmbed } = await import("../services/ollama.js");
        const embedding = await ollamaEmbed(c.content);
        embeddingItems.push({
          user_id: userId,
          source_type: "file_chunk",
          source_id: fileId,
          chunk_index: c.index,
          content: c.content,
          embedding,
        });
      } catch {}
    }

    if (embeddingItems.length > 0) {
      await ctx.repos.embeddings.createMany(embeddingItems);
    }
  } catch (err) {
    console.error("File extraction failed:", err);
    await ctx.repos.files.updateExtractionStatus(userId, fileId, { extraction_status: "failed" });
  }
}

export async function listConversationFiles(
  request: Request,
  ctx: ApiContext,
  conversationId: string,
) {
  const authCtx = await requireAuth(request, ctx);
  const files = await ctx.repos.conversationFiles.listByConversation(
    authCtx.userId,
    conversationId,
  );
  return Response.json({ files });
}

export async function listUserFiles(request: Request, ctx: ApiContext) {
  const authCtx = await requireAuth(request, ctx);
  const files = await ctx.repos.files.listByUser(authCtx.userId);
  return Response.json({ files });
}

export async function linkFile(
  request: Request,
  ctx: ApiContext,
  conversationId: string,
  fileId: string,
) {
  const authCtx = await requireAuth(request, ctx);

  // Verify conversation belongs to user
  const conversation = await ctx.repos.conversations.getById(authCtx.userId, conversationId);
  if (!conversation) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Conversation not found" } },
      { status: 404 },
    );
  }

  // Verify file belongs to user
  const file = await ctx.repos.files.getById(authCtx.userId, fileId);
  if (!file) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "File not found" } },
      { status: 404 },
    );
  }

  await ctx.repos.conversationFiles.link(conversationId, fileId);
  return Response.json({ ok: true }, { status: 201 });
}

export async function unlinkFile(
  request: Request,
  ctx: ApiContext,
  conversationId: string,
  fileId: string,
) {
  const authCtx = await requireAuth(request, ctx);

  // Verify file belongs to user
  const file = await ctx.repos.files.getById(authCtx.userId, fileId);
  if (!file) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "File not found" } },
      { status: 404 },
    );
  }

  // Unlink from conversation
  await ctx.repos.conversationFiles.unlink(conversationId, fileId);

  // Check if file is now orphaned
  const refCount = await ctx.repos.conversationFiles.countReferences(fileId);
  if (refCount === 0) {
    await cleanupOrphanedFile(ctx, authCtx.userId, file);
  }

  return Response.json({ ok: true });
}

export async function downloadFile(request: Request, ctx: ApiContext, fileId: string) {
  const authCtx = await requireAuth(request, ctx);
  const file = await ctx.repos.files.getById(authCtx.userId, fileId);
  if (!file) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "File not found" } },
      { status: 404 },
    );
  }

  const buffer = await downloadObject(file.minio_object_key);
  return new Response(buffer, {
    headers: {
      "Content-Type": file.mime_type,
      "Content-Disposition": `attachment; filename="${file.original_filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}

export async function deleteFile(request: Request, ctx: ApiContext, fileId: string) {
  const authCtx = await requireAuth(request, ctx);
  const file = await ctx.repos.files.getById(authCtx.userId, fileId);
  if (!file) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "File not found" } },
      { status: 404 },
    );
  }

  await cleanupOrphanedFile(ctx, authCtx.userId, file);
  return Response.json({ ok: true });
}

async function cleanupOrphanedFile(
  ctx: ApiContext,
  userId: string,
  file: { id: string; minio_object_key: string; extracted_text_object_key: string | null },
) {
  // Delete embeddings
  await ctx.repos.embeddings.deleteBySource(userId, "file_chunk", file.id);

  // Delete DB record (cascades junction records)
  await ctx.repos.files.delete(userId, file.id);

  // Delete MinIO objects (best effort)
  try {
    await deleteObject(file.minio_object_key);
    if (file.extracted_text_object_key) {
      await deleteObject(file.extracted_text_object_key);
    }
  } catch (err) {
    console.error("MinIO cleanup failed for file", file.id, err);
  }
}

export { cleanupOrphanedFile };
