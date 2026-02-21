import { hashPasscode, updateMeSchema } from "@lanjam/utils";
import type { ApiContext } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

export async function updateMe(request: Request, ctx: ApiContext) {
  const authCtx = await requireAuth(request, ctx);
  const body = await validateBody(request, updateMeSchema);

  const updates: Record<string, unknown> = {};
  if (body.name) {
    const existing = await ctx.repos.users.findByNameInsensitive(body.name);
    if (existing && existing.id !== authCtx.userId) {
      return Response.json(
        { error: { code: "CONFLICT", message: "That name is already taken" } },
        { status: 409 },
      );
    }
    updates.name = body.name;
  }
  if (body.ui_theme) updates.ui_theme = body.ui_theme;
  if (body.passcode) updates.passcode_hash = await hashPasscode(body.passcode);
  if (body.safe_mode_enabled !== undefined) {
    if (authCtx.user.role === "child" || authCtx.user.role === "teen") {
      return Response.json(
        { error: { code: "FORBIDDEN", message: "Safe Mode setting not available for your role" } },
        { status: 403 },
      );
    }
    updates.safe_mode_enabled = body.safe_mode_enabled;
  }

  if (Object.keys(updates).length > 0) {
    await ctx.repos.users.update(authCtx.userId, updates as any);
  }

  return Response.json({ ok: true });
}
