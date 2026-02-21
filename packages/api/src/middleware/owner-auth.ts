import { UnauthorizedError, hashSessionToken } from "@lanjam/utils";
import type { ApiContext } from "../context.js";

const OWNER_COOKIE_NAME = "lanjam_owner_session";

export interface OwnerAuthContext extends ApiContext {
  ownerId: string;
  ownerSessionId: string;
}

function parseCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function authenticateOwnerRequest(
  request: Request,
  ctx: ApiContext,
): Promise<OwnerAuthContext | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const token = parseCookie(cookieHeader, OWNER_COOKIE_NAME);
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const session = await ctx.repos.ownerSessions.findByTokenHash(tokenHash);
  if (!session) return null;

  if (session.expires_at < new Date()) {
    await ctx.repos.ownerSessions.delete(session.id);
    return null;
  }

  // Update last_seen periodically
  const lastSeen = session.last_seen_at.getTime();
  if (Date.now() - lastSeen > 60 * 1000) {
    await ctx.repos.ownerSessions.updateLastSeen(session.id);
  }

  return {
    ...ctx,
    ownerId: session.owner_id,
    ownerSessionId: session.id,
  };
}

export async function requireOwnerAuth(
  request: Request,
  ctx: ApiContext,
): Promise<OwnerAuthContext> {
  const authCtx = await authenticateOwnerRequest(request, ctx);
  if (!authCtx) throw new UnauthorizedError();
  return authCtx;
}
