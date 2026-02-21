import type { ApiContext } from "../context.js";
import { requireAuth } from "../middleware/auth.js";

export async function searchConversations(request: Request, ctx: ApiContext) {
  const authCtx = await requireAuth(request, ctx);
  const url = new URL(request.url);
  const q = url.searchParams.get("q");

  if (!q || q.trim().length === 0) {
    return Response.json({ results: [] });
  }

  try {
    const results = await ctx.repos.conversations.searchContent(authCtx.userId, q.trim());
    return Response.json({ results });
  } catch (err) {
    console.error("Search failed:", err);
    return Response.json({ results: [] });
  }
}
