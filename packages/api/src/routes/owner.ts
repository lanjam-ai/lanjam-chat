import {
  OWNER_SESSION_HOURS,
  SSE_HEADERS,
  generateSessionToken,
  hashPasscode,
  hashSessionToken,
  ownerLoginSchema,
  ownerRecoverSchema,
  ownerResetUserPasscodeSchema,
  verifyPasscode,
} from "@lanjam/utils";
import { sql } from "drizzle-orm";
import type { ApiContext } from "../context.js";
import { clearOwnerSessionCookie, createOwnerSessionCookie } from "../middleware/cookie.js";
import { authenticateOwnerRequest, requireOwnerAuth } from "../middleware/owner-auth.js";
import { validateBody } from "../middleware/validate.js";
import { clearAllObjects } from "../services/minio.js";
import { checkRateLimit, clearFailures, recordFailure } from "../services/rate-limiter.js";

export async function getOwnerStatus(_request: Request, ctx: ApiContext) {
  const owner = await ctx.repos.systemOwner.find();
  return Response.json({ initialized: !!owner });
}

export async function login(request: Request, ctx: ApiContext) {
  const body = await validateBody(request, ownerLoginSchema);

  const rateLimitKey = "owner:login";
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

  const owner = await ctx.repos.systemOwner.find();
  if (!owner) {
    return Response.json(
      { error: { code: "NOT_INITIALIZED", message: "Owner account not initialized" } },
      { status: 404 },
    );
  }

  const valid = await verifyPasscode(owner.passcode_hash, body.passcode);
  if (!valid) {
    recordFailure(rateLimitKey);
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid passcode" } },
      { status: 401 },
    );
  }

  clearFailures(rateLimitKey);

  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + OWNER_SESSION_HOURS * 60 * 60 * 1000);

  await ctx.repos.ownerSessions.create({
    owner_id: owner.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    user_agent: request.headers.get("user-agent") ?? undefined,
    ip: request.headers.get("x-forwarded-for") ?? undefined,
  });

  await ctx.repos.ownerAuditLog.log({
    action: "owner_login",
    ip: request.headers.get("x-forwarded-for") ?? undefined,
    user_agent: request.headers.get("user-agent") ?? undefined,
  });

  const cookie = createOwnerSessionCookie(token, OWNER_SESSION_HOURS * 60 * 60);

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookie,
    },
  });
}

export async function logout(request: Request, ctx: ApiContext) {
  const authCtx = await authenticateOwnerRequest(request, ctx);
  if (authCtx) {
    await ctx.repos.ownerSessions.delete(authCtx.ownerSessionId);
    await ctx.repos.ownerAuditLog.log({
      action: "owner_logout",
      ip: request.headers.get("x-forwarded-for") ?? undefined,
      user_agent: request.headers.get("user-agent") ?? undefined,
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearOwnerSessionCookie(),
    },
  });
}

export async function getMe(request: Request, ctx: ApiContext) {
  await requireOwnerAuth(request, ctx);
  return Response.json({ ok: true });
}

export async function recover(request: Request, ctx: ApiContext) {
  const body = await validateBody(request, ownerRecoverSchema);

  const rateLimitKey = "owner:recover";
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

  const owner = await ctx.repos.systemOwner.find();
  if (!owner) {
    return Response.json(
      { error: { code: "NOT_INITIALIZED", message: "Owner account not initialized" } },
      { status: 404 },
    );
  }

  const keyHash = hashSessionToken(body.recoveryKey);
  if (keyHash !== owner.recovery_key_hash) {
    recordFailure(rateLimitKey);
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid recovery key" } },
      { status: 401 },
    );
  }

  clearFailures(rateLimitKey);

  const newHash = await hashPasscode(body.newPasscode);
  await ctx.repos.systemOwner.updatePasscodeHash(owner.id, newHash);

  await ctx.repos.ownerAuditLog.log({
    action: "owner_recover",
    ip: request.headers.get("x-forwarded-for") ?? undefined,
    user_agent: request.headers.get("user-agent") ?? undefined,
  });

  return Response.json({ ok: true });
}

export async function listUsers(request: Request, ctx: ApiContext) {
  await requireOwnerAuth(request, ctx);
  const users = await ctx.repos.users.listAll();
  return Response.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      is_disabled: u.is_disabled,
    })),
  });
}

export async function resetUserPasscode(request: Request, ctx: ApiContext, userId: string) {
  const authCtx = await requireOwnerAuth(request, ctx);
  const body = await validateBody(request, ownerResetUserPasscodeSchema);

  const user = await ctx.repos.users.findById(userId);
  if (!user) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "User not found" } },
      { status: 404 },
    );
  }

  const passcode_hash = await hashPasscode(body.newPasscode);
  await ctx.repos.users.update(userId, { passcode_hash });

  await ctx.repos.ownerAuditLog.log({
    action: "reset_user_passcode",
    target_user_id: userId,
    ip: request.headers.get("x-forwarded-for") ?? undefined,
    user_agent: request.headers.get("user-agent") ?? undefined,
  });

  return Response.json({ ok: true });
}

export async function systemReset(request: Request, ctx: ApiContext) {
  await requireOwnerAuth(request, ctx);
  const body = await request.json();

  if (body?.confirmation !== "reset") {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "You must confirm the reset" } },
      { status: 400 },
    );
  }

  await ctx.repos.ownerAuditLog.log({
    action: "system_reset",
    ip: request.headers.get("x-forwarded-for") ?? undefined,
    user_agent: request.headers.get("user-agent") ?? undefined,
  });

  const steps = [
    { message: "Clearing file storage...", fn: () => clearAllObjects() },
    {
      message: "Deleting embeddings...",
      fn: () => ctx.db.execute(sql`TRUNCATE TABLE embeddings CASCADE`),
    },
    { message: "Deleting files...", fn: () => ctx.db.execute(sql`TRUNCATE TABLE files CASCADE`) },
    {
      message: "Deleting messages...",
      fn: () => ctx.db.execute(sql`TRUNCATE TABLE messages CASCADE`),
    },
    {
      message: "Deleting conversations...",
      fn: () =>
        ctx.db.execute(
          sql`TRUNCATE TABLE conversations, conversation_tags, conversation_groups, tags CASCADE`,
        ),
    },
    {
      message: "Deleting sessions...",
      fn: () => ctx.db.execute(sql`TRUNCATE TABLE sessions CASCADE`),
    },
    { message: "Deleting users...", fn: () => ctx.db.execute(sql`TRUNCATE TABLE users CASCADE`) },
    {
      message: "Clearing system data...",
      fn: () => ctx.db.execute(sql`TRUNCATE TABLE llm_models, system_kv CASCADE`),
    },
    {
      message: "Clearing owner sessions...",
      fn: () => ctx.db.execute(sql`TRUNCATE TABLE owner_sessions CASCADE`),
    },
  ];

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const total = steps.length;

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const event = `data: ${JSON.stringify({ step: i + 1, total, message: step.message })}\n\n`;
        controller.enqueue(encoder.encode(event));

        try {
          await step.fn();
        } catch (err) {
          const errorEvent = `data: ${JSON.stringify({ error: true, message: err instanceof Error ? err.message : "Reset step failed" })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
          controller.close();
          return;
        }
      }

      const doneEvent = `data: ${JSON.stringify({ done: true })}\n\n`;
      controller.enqueue(encoder.encode(doneEvent));
      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

export async function getAuditLog(request: Request, ctx: ApiContext) {
  await requireOwnerAuth(request, ctx);
  const entries = await ctx.repos.ownerAuditLog.list(100);
  return Response.json({ entries });
}
