import { SSE_HEADERS, createMessageSchema } from "@lanjam/utils";
import type { ApiContext } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import type { OllamaChatChunk } from "../services/ollama.js";
import { ollamaChatStream, ollamaEmbed } from "../services/ollama.js";
import { cleanupOrphanedFile } from "./files.js";

const TITLE_GENERATION_PROMPT = `You are a title generator. Given a user question and an assistant response, write a concise conversational title that describes what the user asked about.

Rules:
- Maximum 50 characters
- Write a natural, readable phrase (e.g. "How credit card transactions work")
- Do NOT quote or copy verbatim text from the conversation
- Do NOT start with "User asks" or "Question about" or similar prefixes
- Do NOT include punctuation at the end
- Reply with ONLY the title, nothing else`;

/** Strip quotes, trailing punctuation, and enforce length limit. */
function cleanGeneratedTitle(raw: string): string {
  let title = raw.trim();
  // Remove wrapping quotes
  if (
    (title.startsWith('"') && title.endsWith('"')) ||
    (title.startsWith("'") && title.endsWith("'"))
  ) {
    title = title.slice(1, -1).trim();
  }
  // Remove leading "Title: " or similar
  title = title.replace(/^(title:\s*)/i, "");
  // Remove trailing period/colon
  title = title.replace(/[.:]+$/, "").trim();
  // Enforce length
  if (title.length > 50) {
    // Cut at last space before limit to avoid mid-word truncation
    const truncated = title.slice(0, 50);
    const lastSpace = truncated.lastIndexOf(" ");
    title = lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated;
  }
  return title;
}

export async function listMessages(request: Request, ctx: ApiContext, conversationId: string) {
  const authCtx = await requireAuth(request, ctx);
  const msgs = await ctx.repos.messages.listByConversation(authCtx.userId, conversationId);
  if (msgs === null) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Conversation not found" } },
      { status: 404 },
    );
  }

  // Batch-fetch file attachments for all messages
  const messageIds = msgs.map((m) => m.id);
  const allMessageFiles = await ctx.repos.messageFiles.listByMessages(messageIds);

  const filesByMessage = new Map<
    string,
    { id: string; original_filename: string; extractionFailed: boolean }[]
  >();
  for (const mf of allMessageFiles) {
    const existing = filesByMessage.get(mf.message_id) ?? [];
    existing.push({
      id: mf.file_id,
      original_filename: mf.original_filename,
      extractionFailed: mf.extraction_status === "failed",
    });
    filesByMessage.set(mf.message_id, existing);
  }

  // Batch-fetch model names for assistant messages that have llm_model_id
  const modelIds = [...new Set(msgs.filter((m) => m.llm_model_id).map((m) => m.llm_model_id!))];
  const modelMap = new Map<string, { name: string; host: string | null }>();
  if (modelIds.length > 0) {
    for (const modelId of modelIds) {
      const model = await ctx.repos.llmModels.findById(modelId);
      if (model) modelMap.set(modelId, { name: model.name, host: model.host });
    }
  }

  const messages = msgs.map((m) => ({
    ...m,
    files: filesByMessage.get(m.id) ?? [],
    model: m.llm_model_id ? (modelMap.get(m.llm_model_id) ?? null) : null,
    version_group_id: m.version_group_id,
    version_number: m.version_number,
  }));

  return Response.json({ messages });
}

export async function undoLastMessage(request: Request, ctx: ApiContext, conversationId: string) {
  const authCtx = await requireAuth(request, ctx);
  const deleted = await ctx.repos.messages.deleteLast(authCtx.userId, conversationId);
  if (!deleted) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "No message to undo" } },
      { status: 404 },
    );
  }
  return Response.json({ ok: true });
}

export async function deleteLastExchange(request: Request, ctx: ApiContext, conversationId: string) {
  const authCtx = await requireAuth(request, ctx);
  const deleted = await ctx.repos.messages.deleteLastExchange(authCtx.userId, conversationId);
  if (deleted === null) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Conversation not found" } },
      { status: 404 },
    );
  }
  return Response.json({ ok: true, deleted });
}

export async function sendMessage(request: Request, ctx: ApiContext, conversationId: string) {
  const authCtx = await requireAuth(request, ctx);

  const conversation = await ctx.repos.conversations.getById(authCtx.userId, conversationId);
  if (!conversation) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Conversation not found" } },
      { status: 404 },
    );
  }

  const body = await validateBody(request, createMessageSchema);

  // Handle edit mode — set up version groups before creating the new message
  let versionGroupId: string | null = null;
  let versionNumber = 1;

  if (body.editMessageId) {
    const originalMsg = await ctx.repos.messages.getById(authCtx.userId, body.editMessageId);
    if (originalMsg && originalMsg.conversation_id === conversationId) {
      if (originalMsg.version_group_id) {
        // Already part of a version group — get next version number
        versionGroupId = originalMsg.version_group_id;
        versionNumber = (await ctx.repos.messages.getMaxVersionNumber(versionGroupId)) + 1;
      } else {
        // First edit — create a new version group and retroactively tag old messages
        versionGroupId = crypto.randomUUID();
        await ctx.repos.messages.setVersionGroup(originalMsg.id, versionGroupId, 1);

        // Tag the assistant response that follows the original user message
        const allMsgs = await ctx.repos.messages.listByConversation(authCtx.userId, conversationId);
        if (allMsgs) {
          const origIdx = allMsgs.findIndex((m) => m.id === originalMsg.id);
          if (
            origIdx >= 0 &&
            origIdx + 1 < allMsgs.length &&
            allMsgs[origIdx + 1].role === "assistant"
          ) {
            await ctx.repos.messages.setVersionGroup(allMsgs[origIdx + 1].id, versionGroupId, 1);
          }
        }
        versionNumber = 2;
      }
    }
  }

  // Save user message
  const userMsg = await ctx.repos.messages.create(authCtx.userId, conversationId, {
    role: "user",
    content: body.content,
    version_group_id: versionGroupId,
    version_number: versionNumber,
  });

  // Link per-message files (if any)
  if (body.fileIds && body.fileIds.length > 0) {
    await ctx.repos.messageFiles.linkMany(userMsg.id, body.fileIds);
  }

  // Wait for extraction to complete on attached files (max 30s)
  let activeFileIds = body.fileIds ?? [];
  if (activeFileIds.length > 0) {
    const maxWait = 30_000;
    const pollInterval = 1_000;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      const records = await ctx.repos.files.getByIds(authCtx.userId, activeFileIds);
      const allDone = records.every(
        (f) => f.extraction_status === "done" || f.extraction_status === "failed",
      );
      if (allDone) break;
      await new Promise((r) => setTimeout(r, pollInterval));
    }

    // Clean up files that failed extraction — don't send them to the LLM
    const records = await ctx.repos.files.getByIds(authCtx.userId, activeFileIds);
    const failedFiles = records.filter((f) => f.extraction_status === "failed");
    const failedIds = failedFiles.map((f) => f.id);

    if (failedIds.length > 0) {
      await ctx.repos.messageFiles.unlinkMany(userMsg.id, failedIds);

      for (const f of failedFiles) {
        await ctx.repos.conversationFiles.unlink(conversationId, f.id);
        const refCount = await ctx.repos.conversationFiles.countReferences(f.id);
        if (refCount === 0) {
          await cleanupOrphanedFile(ctx, authCtx.userId, f);
        }
      }

      activeFileIds = activeFileIds.filter((id) => !failedIds.includes(id));
    }
  }

  // Get conversation history — exclude old versions (only keep latest version per group)
  const history = await ctx.repos.messages.listByConversation(authCtx.userId, conversationId);
  const allMsgsRaw = history ?? [];

  // Build a map of version_group_id → max version_number to filter old versions
  const maxVersions = new Map<string, number>();
  for (const m of allMsgsRaw) {
    if (m.version_group_id) {
      const current = maxVersions.get(m.version_group_id) ?? 0;
      if (m.version_number > current) maxVersions.set(m.version_group_id, m.version_number);
    }
  }

  const chatMessages = allMsgsRaw
    .filter((m) => {
      if (!m.version_group_id) return true;
      return m.version_number === maxVersions.get(m.version_group_id);
    })
    .map((m) => ({ role: m.role, content: m.content }));

  // Inject attached file content directly (works even before embeddings are ready)
  const fileIds = await ctx.repos.conversationFiles.getFileIds(conversationId);
  if (fileIds.length > 0) {
    const fileRecords = await ctx.repos.files.getByIds(authCtx.userId, fileIds);
    const fileContextParts: string[] = [];

    for (const f of fileRecords) {
      if (f.extraction_status === "done" && f.extracted_text_preview) {
        const preview = f.extracted_text_preview.slice(0, 4000);
        fileContextParts.push(`--- ${f.original_filename} ---\n${preview}`);
      } else if (f.extraction_status === "pending") {
        fileContextParts.push(
          `--- ${f.original_filename} ---\n[File is still being processed — text content is not yet available]`,
        );
      } else if (f.extraction_status === "failed") {
        fileContextParts.push(
          `--- ${f.original_filename} ---\n[Text extraction failed for this file]`,
        );
      } else {
        // "done" but no extracted text (e.g. unsupported format like images)
        fileContextParts.push(
          `--- ${f.original_filename} (${f.mime_type}) ---\n[This file is attached but its content could not be extracted as text]`,
        );
      }
    }

    if (fileContextParts.length > 0) {
      chatMessages.unshift({
        role: "system",
        content: `The user has attached the following files to this conversation:\n\n${fileContextParts.join("\n\n")}`,
      });
    }
  }

  // Try RAG context for more targeted retrieval from large files (best effort)
  try {
    const embedding = await ollamaEmbed(body.content);
    if (embedding.length > 0) {
      const chunks = await ctx.repos.embeddings.searchByVector(authCtx.userId, embedding, {
        conversationId,
        fileIds,
        limit: 8,
      });
      if (chunks.length > 0) {
        const contextText = chunks.map((c) => c.content).join("\n\n---\n\n");
        chatMessages.unshift({
          role: "system",
          content: `Additional relevant context from files and messages:\n\n${contextText}`,
        });
      }
    }
  } catch {}

  // Inject per-message file targeting hint (as system context, before history)
  if (activeFileIds.length > 0) {
    const attachedRecords = await ctx.repos.files.getByIds(authCtx.userId, activeFileIds);
    const names = attachedRecords.map((f) => f.original_filename).join(", ");
    chatMessages.unshift({
      role: "system",
      content: `The user's latest message refers specifically to these attached files: ${names}. Focus your answer on the content from these files.`,
    });
  }

  // Inject group guidance (between file hints and safety content)
  if (conversation.group_id) {
    const group = await ctx.repos.conversationGroups.getById(authCtx.userId, conversation.group_id);
    if (group?.guidance_text) {
      chatMessages.unshift({
        role: "system",
        content: group.guidance_text,
      });
    }
  }

  // Inject safety content as the very first system message
  if (conversation.safety_content) {
    chatMessages.unshift({
      role: "system",
      content: conversation.safety_content,
    });
  }

  // Resolve which model to use (priority: explicit request > conversation default > system active)
  let resolvedModel: { id: string; name: string; host: string | null } | null = null;

  if (body.modelName) {
    const model = await ctx.repos.llmModels.findByName(body.modelName, body.modelHost ?? null);
    if (model && model.is_installed)
      resolvedModel = { id: model.id, name: model.name, host: model.host };
  }

  if (!resolvedModel && conversation.llm_model_id) {
    const model = await ctx.repos.llmModels.findById(conversation.llm_model_id);
    if (model && model.is_installed)
      resolvedModel = { id: model.id, name: model.name, host: model.host };
  }

  if (!resolvedModel) {
    const activeModel = await ctx.repos.llmModels.getActive();
    if (activeModel)
      resolvedModel = { id: activeModel.id, name: activeModel.name, host: activeModel.host };
  }

  if (!resolvedModel) {
    return Response.json(
      {
        error: {
          code: "NO_MODEL",
          message: "No AI model is available. An administrator must configure one.",
        },
      },
      { status: 503 },
    );
  }

  // Validate role-based access
  const user = await ctx.repos.users.findById(authCtx.userId);
  if (user) {
    const fullModel = await ctx.repos.llmModels.findById(resolvedModel.id);
    if (fullModel) {
      const role = user.role;
      const safeMode = conversation.safe_mode === true || user.safe_mode_enabled;
      let allowed = true;
      if (role === "teen" && !fullModel.allow_teen) allowed = false;
      if (role === "child" && !fullModel.allow_child) allowed = false;
      if (role === "adult" && safeMode && !fullModel.safe_mode_allowed) allowed = false;
      if (!allowed && role !== "admin") {
        return Response.json(
          {
            error: { code: "FORBIDDEN", message: "You do not have access to the selected model." },
          },
          { status: 403 },
        );
      }
    }
  }

  const modelName = resolvedModel.name;
  const modelHost = resolvedModel.host ?? undefined;
  const modelId = resolvedModel.id;

  // Update conversation's model if user explicitly selected one
  if (body.modelName) {
    await ctx.repos.conversations.update(authCtx.userId, conversationId, { llm_model_id: modelId });
  }

  // Create SSE stream with keep-alive heartbeat
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Send a keep-alive comment every 5s to prevent connection timeout
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 5_000);

      let fullContent = "";
      let responseMetadata: OllamaChatChunk["metadata"] = undefined;

      try {
        // Send a status event so the client knows the model is loading
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Thinking..." })}\n\n`),
        );

        for await (const chunk of ollamaChatStream(modelName, chatMessages, modelHost)) {
          fullContent += chunk.content;
          const event = `data: ${JSON.stringify({ type: "token", content: chunk.content })}\n\n`;
          controller.enqueue(encoder.encode(event));

          if (chunk.done && chunk.metadata) {
            responseMetadata = chunk.metadata;
          }
        }

        // Save assistant message with model, metadata, and version info
        const assistantMsg = await ctx.repos.messages.create(authCtx.userId, conversationId, {
          role: "assistant",
          content: fullContent,
          llm_model_id: modelId,
          metadata: responseMetadata
            ? (responseMetadata as unknown as Record<string, unknown>)
            : null,
          version_group_id: versionGroupId,
          version_number: versionNumber,
        });

        const doneEvent = `data: ${JSON.stringify({
          type: "done",
          messageId: assistantMsg.id,
          userMessageId: userMsg.id,
          metadata: responseMetadata ?? null,
          model: { name: modelName, host: resolvedModel.host },
          versionGroupId: versionGroupId,
          versionNumber: versionNumber,
          editMessageId: body.editMessageId ?? null,
        })}\n\n`;
        controller.enqueue(encoder.encode(doneEvent));

        // Generate title if first exchange
        if (conversation.title === "New conversation" && fullContent.length > 0) {
          try {
            let titleContent = "";
            for await (const chunk of ollamaChatStream(
              modelName,
              [
                {
                  role: "system",
                  content: TITLE_GENERATION_PROMPT,
                },
                {
                  role: "user",
                  content: `User question:\n${body.content.slice(0, 300)}\n\nAssistant response:\n${fullContent.slice(0, 300)}`,
                },
              ],
              modelHost,
            )) {
              titleContent += chunk.content;
            }
            const title = cleanGeneratedTitle(titleContent);
            if (title) {
              await ctx.repos.conversations.update(authCtx.userId, conversationId, { title });
              const titleEvent = `data: ${JSON.stringify({ type: "title", title })}\n\n`;
              controller.enqueue(encoder.encode(titleEvent));
            }
          } catch {}
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Stream failed";
        console.error("Chat stream error:", message);

        // Persist partial assistant message with error metadata
        let errorMessageId: string | undefined;
        try {
          const savedMsg = await ctx.repos.messages.create(authCtx.userId, conversationId, {
            role: "assistant",
            content: fullContent,
            llm_model_id: modelId,
            metadata: { status: "error", error: message, ...(responseMetadata as Record<string, unknown> ?? {}) },
            version_group_id: versionGroupId,
            version_number: versionNumber,
          });
          errorMessageId = savedMsg.id;
        } catch (saveErr) {
          console.error("Failed to save error message:", saveErr);
        }

        const errorEvent = `data: ${JSON.stringify({ type: "error", error: message, messageId: errorMessageId ?? null })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
      } finally {
        clearInterval(heartbeat);
      }

      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

export async function generateTitle(request: Request, ctx: ApiContext, conversationId: string) {
  const authCtx = await requireAuth(request, ctx);

  const conversation = await ctx.repos.conversations.getById(authCtx.userId, conversationId);
  if (!conversation) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Conversation not found" } },
      { status: 404 },
    );
  }

  const history = await ctx.repos.messages.listByConversation(authCtx.userId, conversationId);
  if (!history || history.length === 0) {
    return Response.json(
      { error: { code: "BAD_REQUEST", message: "No messages to generate a title from" } },
      { status: 400 },
    );
  }

  // Build a summary from the first few messages
  const firstMessages = history.slice(0, 4);
  const summary = firstMessages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 300)}`)
    .join("\n\n");

  const activeModel = await ctx.repos.llmModels.getActive();
  const modelName = activeModel?.name ?? "llama3.2";
  const modelHost = activeModel?.host ?? undefined;

  // Stream title generation via SSE so the client can abort
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        let titleContent = "";
        for await (const chunk of ollamaChatStream(
          modelName,
          [
            { role: "system", content: TITLE_GENERATION_PROMPT },
            { role: "user", content: summary },
          ],
          modelHost,
        )) {
          titleContent += chunk.content;
          const event = `data: ${JSON.stringify({ type: "token", content: chunk.content })}\n\n`;
          controller.enqueue(encoder.encode(event));
        }
        const title = cleanGeneratedTitle(titleContent);
        const doneEvent = `data: ${JSON.stringify({ type: "done", title })}\n\n`;
        controller.enqueue(encoder.encode(doneEvent));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Title generation failed";
        const errorEvent = `data: ${JSON.stringify({ type: "error", error: message })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

export async function saveCancelledMessage(
  request: Request,
  ctx: ApiContext,
  conversationId: string,
) {
  const authCtx = await requireAuth(request, ctx);

  const conversation = await ctx.repos.conversations.getById(authCtx.userId, conversationId);
  if (!conversation) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Conversation not found" } },
      { status: 404 },
    );
  }

  const body = (await request.json()) as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content : "";
  const modelId = typeof body.modelId === "string" ? body.modelId : null;
  const versionGroupId = typeof body.versionGroupId === "string" ? body.versionGroupId : null;
  const versionNumber = typeof body.versionNumber === "number" ? body.versionNumber : 1;

  const savedMsg = await ctx.repos.messages.create(authCtx.userId, conversationId, {
    role: "assistant",
    content,
    llm_model_id: modelId,
    metadata: { status: "cancelled" },
    version_group_id: versionGroupId,
    version_number: versionNumber,
  });

  return Response.json({ ok: true, messageId: savedMsg.id });
}

export async function deleteMessage(
  request: Request,
  ctx: ApiContext,
  conversationId: string,
  messageId: string,
) {
  const authCtx = await requireAuth(request, ctx);

  // Verify conversation ownership
  const conversation = await ctx.repos.conversations.getById(authCtx.userId, conversationId);
  if (!conversation) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Conversation not found" } },
      { status: 404 },
    );
  }

  const deleted = await ctx.repos.messages.deleteById(authCtx.userId, messageId);
  if (!deleted) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Message not found" } },
      { status: 404 },
    );
  }

  return Response.json({ ok: true });
}
