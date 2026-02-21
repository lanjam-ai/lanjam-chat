import {
  DEFAULT_SAFETY_RULES,
  type SafetyRuleType,
  createConversationSchema,
  listConversationsSchema,
  updateConversationSchema,
} from "@lanjam/utils";
import type { ApiContext } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

export async function listConversations(request: Request, ctx: ApiContext) {
  const authCtx = await requireAuth(request, ctx);
  const url = new URL(request.url);
  const tagValues = url.searchParams.getAll("tag").filter(Boolean);
  const params = {
    archived: url.searchParams.get("archived") === "true" ? true : undefined,
    q: url.searchParams.get("q") ?? undefined,
    tagNames: tagValues.length > 0 ? tagValues : undefined,
    groupId: url.searchParams.get("group") ?? undefined,
    ungrouped: url.searchParams.get("ungrouped") === "true" ? true : undefined,
  };

  const conversations = await ctx.repos.conversations.list(authCtx.userId, params);
  return Response.json({ conversations });
}

export async function createConversation(request: Request, ctx: ApiContext) {
  const authCtx = await requireAuth(request, ctx);
  const body = await validateBody(request, createConversationSchema);

  const user = await ctx.repos.users.findById(authCtx.userId);
  if (!user) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "User not found" } },
      { status: 404 },
    );
  }

  let safeMode: boolean | undefined;
  let safetyContent: string | undefined;

  if (user.role === "child" || user.role === "teen") {
    safeMode = true;
    const ruleType = user.role as SafetyRuleType;
    const rule = await ctx.repos.safetyRules.getByType(ruleType);
    safetyContent = rule?.content ?? DEFAULT_SAFETY_RULES[ruleType];
  } else {
    const requestedSafeMode = body.safe_mode ?? (user.safe_mode_enabled ? true : undefined);
    if (requestedSafeMode === true) {
      safeMode = true;
      const rule = await ctx.repos.safetyRules.getByType("adult");
      safetyContent = rule?.content ?? DEFAULT_SAFETY_RULES.adult;
    }
  }

  const conversation = await ctx.repos.conversations.create(authCtx.userId, {
    title: body.title,
    safe_mode: safeMode,
    safety_content: safetyContent,
    llm_model_id: body.llm_model_id,
    group_id: body.group_id,
  });
  return Response.json({ conversation }, { status: 201 });
}

export async function getConversation(request: Request, ctx: ApiContext, id: string) {
  const authCtx = await requireAuth(request, ctx);
  const conversation = await ctx.repos.conversations.getById(authCtx.userId, id);
  if (!conversation) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Conversation not found" } },
      { status: 404 },
    );
  }
  return Response.json({ conversation });
}

export async function updateConversation(request: Request, ctx: ApiContext, id: string) {
  const authCtx = await requireAuth(request, ctx);
  const body = await validateBody(request, updateConversationSchema);

  if (body.safe_mode !== undefined) {
    const user = await ctx.repos.users.findById(authCtx.userId);
    if (!user) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "User not found" } },
        { status: 404 },
      );
    }

    if (user.role === "child" || user.role === "teen") {
      return Response.json(
        { error: { code: "FORBIDDEN", message: "Safe Mode cannot be changed" } },
        { status: 403 },
      );
    }

    const conv = await ctx.repos.conversations.getById(authCtx.userId, id);
    if (!conv) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Conversation not found" } },
        { status: 404 },
      );
    }

    if (body.safe_mode === true && conv.safe_mode === false) {
      return Response.json(
        { error: { code: "FORBIDDEN", message: "Safe Mode cannot be re-enabled once disabled" } },
        { status: 403 },
      );
    }

    if (body.safe_mode === true && conv.safe_mode !== true) {
      const messages = await ctx.repos.messages.listByConversation(authCtx.userId, id);
      if (messages && messages.length > 0) {
        return Response.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "Safe Mode can only be enabled before sending messages",
            },
          },
          { status: 403 },
        );
      }
      const rule = await ctx.repos.safetyRules.getByType("adult");
      const safetyContent = rule?.content ?? DEFAULT_SAFETY_RULES.adult;
      const conversation = await ctx.repos.conversations.update(authCtx.userId, id, {
        ...body,
        safe_mode: true,
        safety_content: safetyContent,
      });
      return Response.json({ conversation });
    }

    if (body.safe_mode === false) {
      const conversation = await ctx.repos.conversations.update(authCtx.userId, id, {
        ...body,
        safe_mode: false,
        safety_content: null,
      });
      return Response.json({ conversation });
    }
  }

  const conversation = await ctx.repos.conversations.update(authCtx.userId, id, body);
  if (!conversation) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Conversation not found" } },
      { status: 404 },
    );
  }
  return Response.json({ conversation });
}

export async function deleteConversation(request: Request, ctx: ApiContext, id: string) {
  const authCtx = await requireAuth(request, ctx);

  // Get linked file IDs before deletion (for orphan cleanup)
  const linkedFileIds = await ctx.repos.conversationFiles.getFileIds(id);

  // Delete message embeddings first
  await ctx.repos.embeddings.deleteByConversation(authCtx.userId, id);

  // Delete conversation (cascades messages, junction records, tags)
  const deleted = await ctx.repos.conversations.delete(authCtx.userId, id);
  if (!deleted) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Conversation not found" } },
      { status: 404 },
    );
  }

  // Clean up orphaned files (files with no remaining conversation references)
  for (const fileId of linkedFileIds) {
    try {
      const refCount = await ctx.repos.conversationFiles.countReferences(fileId);
      if (refCount === 0) {
        const file = await ctx.repos.files.getById(authCtx.userId, fileId);
        if (file) {
          const { cleanupOrphanedFile } = await import("./files.js");
          await cleanupOrphanedFile(ctx, authCtx.userId, file);
        }
      }
    } catch (err) {
      console.error("Orphan file cleanup failed for file", fileId, err);
    }
  }

  return Response.json({ ok: true });
}
