import type { ApiContext } from "../context.js";

export async function listPublicUsers(request: Request, ctx: ApiContext) {
  const users = await ctx.repos.users.listPublic();
  return Response.json({ users });
}
