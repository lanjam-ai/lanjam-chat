import { createTagSchema, setConversationTagsSchema, updateTagSchema } from "@lanjam/utils";
import type { ApiContext } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

export async function listTags(request: Request, ctx: ApiContext) {
  const authCtx = await requireAuth(request, ctx);
  const tags = await ctx.repos.tags.listByUser(authCtx.userId);
  return Response.json({ tags });
}

export async function createTag(request: Request, ctx: ApiContext) {
  const authCtx = await requireAuth(request, ctx);
  const body = await validateBody(request, createTagSchema);

  try {
    const tag = await ctx.repos.tags.create(authCtx.userId, body.name);
    return Response.json({ tag }, { status: 201 });
  } catch (err: any) {
    if (err?.code === "23505") {
      return Response.json(
        { error: { code: "CONFLICT", message: "A tag with that name already exists" } },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function updateTag(request: Request, ctx: ApiContext, tagId: string) {
  const authCtx = await requireAuth(request, ctx);
  const body = await validateBody(request, updateTagSchema);

  try {
    const tag = await ctx.repos.tags.update(tagId, authCtx.userId, body.name);
    if (!tag) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Tag not found" } },
        { status: 404 },
      );
    }
    return Response.json({ tag });
  } catch (err: any) {
    if (err?.code === "23505") {
      return Response.json(
        { error: { code: "CONFLICT", message: "A tag with that name already exists" } },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function deleteTag(request: Request, ctx: ApiContext, tagId: string) {
  const authCtx = await requireAuth(request, ctx);
  const deleted = await ctx.repos.tags.delete(tagId, authCtx.userId);
  if (!deleted) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Tag not found" } },
      { status: 404 },
    );
  }
  return Response.json({ ok: true });
}

export async function listConversationTags(
  request: Request,
  ctx: ApiContext,
  conversationId: string,
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

  const tags = await ctx.repos.tags.getConversationTags(conversationId);
  return Response.json({ tags });
}

export async function setConversationTags(
  request: Request,
  ctx: ApiContext,
  conversationId: string,
) {
  const authCtx = await requireAuth(request, ctx);
  const body = await validateBody(request, setConversationTagsSchema);

  // Verify conversation belongs to user
  const conversation = await ctx.repos.conversations.getById(authCtx.userId, conversationId);
  if (!conversation) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Conversation not found" } },
      { status: 404 },
    );
  }

  await ctx.repos.tags.setConversationTags(conversationId, body.tagIds);
  const tags = await ctx.repos.tags.getConversationTags(conversationId);
  return Response.json({ tags });
}
