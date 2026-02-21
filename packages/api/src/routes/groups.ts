import { createGroupSchema, updateGroupSchema } from "@lanjam/utils";
import type { ApiContext } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

export async function listGroups(request: Request, ctx: ApiContext) {
  const authCtx = await requireAuth(request, ctx);
  const groups = await ctx.repos.conversationGroups.listByUser(authCtx.userId);
  return Response.json({ groups });
}

export async function createGroup(request: Request, ctx: ApiContext) {
  const authCtx = await requireAuth(request, ctx);
  const body = await validateBody(request, createGroupSchema);

  try {
    const group = await ctx.repos.conversationGroups.create(
      authCtx.userId,
      body.name,
      body.guidance_text,
    );
    return Response.json({ group }, { status: 201 });
  } catch (err: any) {
    if (err?.code === "23505") {
      return Response.json(
        { error: { code: "CONFLICT", message: "A group with that name already exists" } },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function updateGroup(request: Request, ctx: ApiContext, groupId: string) {
  const authCtx = await requireAuth(request, ctx);
  const body = await validateBody(request, updateGroupSchema);

  try {
    const group = await ctx.repos.conversationGroups.update(authCtx.userId, groupId, body);
    if (!group) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Group not found" } },
        { status: 404 },
      );
    }
    return Response.json({ group });
  } catch (err: any) {
    if (err?.code === "23505") {
      return Response.json(
        { error: { code: "CONFLICT", message: "A group with that name already exists" } },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function deleteGroup(request: Request, ctx: ApiContext, groupId: string) {
  const authCtx = await requireAuth(request, ctx);
  const deleted = await ctx.repos.conversationGroups.delete(authCtx.userId, groupId);
  if (!deleted) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Group not found" } },
      { status: 404 },
    );
  }
  return Response.json({ ok: true });
}
