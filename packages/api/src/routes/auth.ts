import {
  DEFAULT_SESSION_DAYS,
  UnauthorizedError,
  generateSessionToken,
  hashSessionToken,
  loginSchema,
  verifyPasscode,
} from "@lanjam/utils";
import type { ApiContext } from "../context.js";
import { authenticateRequest, requireAuth } from "../middleware/auth.js";
import { clearSessionCookie, createSessionCookie } from "../middleware/cookie.js";
import { validateBody } from "../middleware/validate.js";
import { checkRateLimit, clearFailures, recordFailure } from "../services/rate-limiter.js";

export async function login(request: Request, ctx: ApiContext) {
  const body = await validateBody(request, loginSchema);

  const rateLimitKey = `login:${body.userId}`;
  const check = checkRateLimit(rateLimitKey);
  if (!check.allowed) {
    return Response.json(
      {
        error: {
          code: "RATE_LIMIT",
          message: `Too many attempts. Try again in ${check.retryAfterSeconds}s`,
        },
      },
      { status: 429 },
    );
  }

  const user = await ctx.repos.users.findById(body.userId);
  if (!user || user.is_disabled) {
    recordFailure(rateLimitKey);
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid credentials" } },
      { status: 401 },
    );
  }

  const valid = await verifyPasscode(user.passcode_hash, body.passcode);
  if (!valid) {
    recordFailure(rateLimitKey);
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid credentials" } },
      { status: 401 },
    );
  }

  clearFailures(rateLimitKey);

  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const sessionDays = Number(process.env.SESSION_DAYS ?? DEFAULT_SESSION_DAYS);
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);

  await ctx.repos.sessions.create({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    user_agent: request.headers.get("user-agent") ?? undefined,
    ip: request.headers.get("x-forwarded-for") ?? undefined,
  });

  const cookie = createSessionCookie(token, sessionDays * 24 * 60 * 60);

  return new Response(
    JSON.stringify({
      user: { id: user.id, name: user.name, role: user.role, ui_theme: user.ui_theme },
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookie,
      },
    },
  );
}

export async function logout(request: Request, ctx: ApiContext) {
  const authCtx = await authenticateRequest(request, ctx);
  if (authCtx) {
    await ctx.repos.sessions.delete(authCtx.sessionId);
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearSessionCookie(),
    },
  });
}

export async function getMe(request: Request, ctx: ApiContext) {
  const authCtx = await requireAuth(request, ctx);
  return Response.json({
    user: authCtx.user,
  });
}
