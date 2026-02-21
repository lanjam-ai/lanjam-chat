import type { Repositories } from "@lanjam/db";
import { ForbiddenError, UnauthorizedError, hashSessionToken } from "@lanjam/utils";
import type { ApiContext, AuthContext } from "../context.js";

const COOKIE_NAME = "lanjam_session";

function parseCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function authenticateRequest(
  request: Request,
  ctx: ApiContext,
): Promise<AuthContext | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const token = parseCookie(cookieHeader, COOKIE_NAME);
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const result = await ctx.repos.sessions.findByTokenHash(tokenHash);
  if (!result) return null;

  const { session, user } = result;

  if (session.expires_at < new Date()) {
    await ctx.repos.sessions.delete(session.id);
    return null;
  }

  if (user.is_disabled) return null;

  // Update last_seen periodically (not every request)
  const lastSeen = session.last_seen_at.getTime();
  if (Date.now() - lastSeen > 5 * 60 * 1000) {
    await ctx.repos.sessions.updateLastSeen(session.id);
  }

  return {
    ...ctx,
    userId: user.id,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      is_disabled: user.is_disabled,
      ui_theme: user.ui_theme,
      safe_mode_enabled: user.safe_mode_enabled,
    },
    sessionId: session.id,
  };
}

export async function requireAuth(request: Request, ctx: ApiContext): Promise<AuthContext> {
  const authCtx = await authenticateRequest(request, ctx);
  if (!authCtx) throw new UnauthorizedError();
  return authCtx;
}

export async function requireAdmin(request: Request, ctx: ApiContext): Promise<AuthContext> {
  const authCtx = await requireAuth(request, ctx);
  if (authCtx.user.role !== "admin") throw new ForbiddenError();
  return authCtx;
}
