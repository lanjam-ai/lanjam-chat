import {
  SSE_HEADERS,
  SUGGESTED_MODELS,
  createUserSchema,
  generateRecoveryKey,
  hashPasscode,
  hashSessionToken,
  ownerSetupSchema,
  updateUserSchema,
} from "@lanjam/utils";
import { sql } from "drizzle-orm";
import type { ApiContext } from "../context.js";
import { requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { clearAllObjects, deleteByPrefix, ensureBucket, minioPing } from "../services/minio.js";
import {
  ollamaDeleteModel,
  ollamaListModels,
  ollamaPing,
  ollamaPullModel,
  ollamaStart,
  ollamaVersion,
} from "../services/ollama.js";
import { whisperPing } from "../services/whisper.js";

export async function getStatus(request: Request, ctx: ApiContext) {
  const authCtx = await requireAdmin(request, ctx);

  const checks: Record<string, { ok: boolean; message: string; details?: unknown }> = {};

  // DB check
  try {
    await ctx.repos.users.count();
    checks.database = { ok: true, message: "Connected" };
  } catch (err) {
    checks.database = { ok: false, message: err instanceof Error ? err.message : "Failed" };
  }

  // MinIO check
  try {
    const ok = await minioPing();
    if (ok) {
      await ensureBucket();
      checks.minio = { ok: true, message: "Connected, bucket ready" };
    } else {
      checks.minio = { ok: false, message: "Not reachable" };
    }
  } catch (err) {
    checks.minio = { ok: false, message: err instanceof Error ? err.message : "Failed" };
  }

  // Ollama check
  try {
    const ok = await ollamaPing();
    if (ok) {
      const version = await ollamaVersion();
      const models = await ollamaListModels();
      checks.ollama = {
        ok: true,
        message: `Connected (v${version})`,
        details: { version, modelCount: models.length },
      };
    } else {
      checks.ollama = { ok: false, message: "Not reachable" };
    }
  } catch (err) {
    checks.ollama = { ok: false, message: err instanceof Error ? err.message : "Failed" };
  }

  // Whisper check
  try {
    const ok = await whisperPing();
    if (ok) {
      checks.whisper = { ok: true, message: "Connected" };
    } else {
      checks.whisper = { ok: false, message: "Not reachable" };
    }
  } catch (err) {
    checks.whisper = { ok: false, message: err instanceof Error ? err.message : "Failed" };
  }

  return Response.json({ checks });
}

export async function listUsers(request: Request, ctx: ApiContext) {
  await requireAdmin(request, ctx);
  const users = await ctx.repos.users.listAll();
  return Response.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      is_disabled: u.is_disabled,
      created_at: u.created_at,
    })),
  });
}

export async function createUser(request: Request, ctx: ApiContext) {
  await requireAdmin(request, ctx);
  const body = await validateBody(request, createUserSchema);

  const existing = await ctx.repos.users.findByNameInsensitive(body.name);
  if (existing) {
    return Response.json(
      { error: { code: "CONFLICT", message: "Name already taken" } },
      { status: 409 },
    );
  }

  const passcode_hash = await hashPasscode(body.passcode);
  const user = await ctx.repos.users.create({
    name: body.name,
    role: body.role,
    passcode_hash,
  });

  return Response.json(
    { user: { id: user.id, name: user.name, role: user.role } },
    { status: 201 },
  );
}

export async function updateUser(request: Request, ctx: ApiContext, userId: string) {
  await requireAdmin(request, ctx);
  const body = await validateBody(request, updateUserSchema);

  const updates: Record<string, unknown> = {};
  if (body.role) updates.role = body.role;
  if (body.is_disabled !== undefined) updates.is_disabled = body.is_disabled;
  if (body.passcode) updates.passcode_hash = await hashPasscode(body.passcode);

  const user = await ctx.repos.users.update(userId, updates as any);
  if (!user) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "User not found" } },
      { status: 404 },
    );
  }

  return Response.json({ ok: true });
}

export async function deleteUser(request: Request, ctx: ApiContext, userId: string) {
  const authCtx = await requireAdmin(request, ctx);

  if (authCtx.userId === userId) {
    return Response.json(
      { error: { code: "FORBIDDEN", message: "You cannot delete your own account" } },
      { status: 403 },
    );
  }

  // Clean up MinIO files for this user
  try {
    await deleteByPrefix(`user/${userId}/`);
  } catch {
    // MinIO cleanup is best-effort — DB cascade will still remove file records
  }

  const deleted = await ctx.repos.users.delete(userId);
  if (!deleted) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "User not found" } },
      { status: 404 },
    );
  }

  return Response.json({ ok: true });
}

export async function getLlmModels(request: Request, ctx: ApiContext) {
  await requireAdmin(request, ctx);

  const ollamaAvailable = await ollamaPing();

  let installed: Array<{ name: string; size: number }> = [];
  if (ollamaAvailable) {
    try {
      installed = await ollamaListModels();
    } catch {}
  }

  // Sync local DB records with what Ollama actually has installed
  const installedNames = new Set(installed.map((m) => m.name));
  const dbModels = await ctx.repos.llmModels.list();
  for (const dbModel of dbModels) {
    if (dbModel.host === null && dbModel.is_installed && !installedNames.has(dbModel.name)) {
      await ctx.repos.llmModels.upsert({ name: dbModel.name, is_installed: false });
    } else if (dbModel.host === null && !dbModel.is_installed && installedNames.has(dbModel.name)) {
      await ctx.repos.llmModels.upsert({ name: dbModel.name, is_installed: true });
    }
  }
  // Also ensure newly installed models (not yet in DB) get tracked
  for (const m of installed) {
    if (!dbModels.find((d) => d.host === null && d.name === m.name)) {
      await ctx.repos.llmModels.upsert({ name: m.name, is_installed: true });
    }
  }

  // Re-fetch after sync
  const updatedDbModels = await ctx.repos.llmModels.list();
  const remote = updatedDbModels
    .filter((m) => m.host !== null)
    .map((m) => ({
      name: m.name,
      host: m.host!,
      is_active: m.is_active,
      allow_teen: m.allow_teen,
      allow_child: m.allow_child,
      safe_mode_allowed: m.safe_mode_allowed,
    }));

  // Build access map for local installed models from DB records
  const accessMap = new Map(
    updatedDbModels
      .filter((m) => m.host === null)
      .map((m) => [
        m.name,
        {
          allow_teen: m.allow_teen,
          allow_child: m.allow_child,
          safe_mode_allowed: m.safe_mode_allowed,
        },
      ]),
  );

  const active = await ctx.repos.llmModels.getActive();

  return Response.json({
    ollamaAvailable,
    installed: installed.map((m) => ({
      ...m,
      ...(accessMap.get(m.name) ?? {
        allow_teen: false,
        allow_child: false,
        safe_mode_allowed: true,
      }),
    })),
    remote,
    suggested: SUGGESTED_MODELS,
    active: active ? { name: active.name, host: active.host ?? null } : null,
  });
}

export async function updateModelAccess(request: Request, ctx: ApiContext) {
  await requireAdmin(request, ctx);
  const body = await validateBody(request, (await import("@lanjam/utils")).updateModelAccessSchema);

  const host = body.host ?? null;
  const updates: Record<string, boolean> = {};
  if (body.allow_teen !== undefined) updates.allow_teen = body.allow_teen;
  if (body.allow_child !== undefined) updates.allow_child = body.allow_child;
  if (body.safe_mode_allowed !== undefined) updates.safe_mode_allowed = body.safe_mode_allowed;

  // Ensure the model exists in DB first
  await ctx.repos.llmModels.upsert({ name: body.name, host, is_installed: true });
  const updated = await ctx.repos.llmModels.updateAccess(body.name, host, updates);

  if (!updated) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Model not found" } },
      { status: 404 },
    );
  }

  return Response.json({ ok: true });
}

export async function pullModel(request: Request, ctx: ApiContext) {
  await requireAdmin(request, ctx);
  const body = await validateBody(request, (await import("@lanjam/utils")).pullModelSchema);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const progress of ollamaPullModel(body.name)) {
          const event = `event: progress\ndata: ${JSON.stringify(progress)}\n\n`;
          controller.enqueue(encoder.encode(event));
        }

        // Mark as installed in DB
        await ctx.repos.llmModels.upsert({ name: body.name, is_installed: true });

        const doneEvent = `event: done\ndata: ${JSON.stringify({ name: body.name })}\n\n`;
        controller.enqueue(encoder.encode(doneEvent));
      } catch (err) {
        const errorEvent = `event: error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : "Pull failed" })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

export async function setActiveModel(request: Request, ctx: ApiContext) {
  await requireAdmin(request, ctx);
  const body = await validateBody(request, (await import("@lanjam/utils")).setActiveModelSchema);

  const host = body.host ?? null;
  await ctx.repos.llmModels.upsert({ name: body.name, host, is_installed: true });
  await ctx.repos.llmModels.setActive(body.name, host);

  return Response.json({ ok: true, active: { name: body.name, host } });
}

export async function deleteModel(request: Request, ctx: ApiContext) {
  await requireAdmin(request, ctx);
  const body = await validateBody(request, (await import("@lanjam/utils")).deleteModelSchema);

  const host = body.host ?? null;
  if (!host) {
    // Local model: delete from Ollama + DB
    await ollamaDeleteModel(body.name);
  }
  await ctx.repos.llmModels.delete(body.name, host);

  return Response.json({ ok: true });
}

export async function testRemoteConnection(request: Request, ctx: ApiContext) {
  await requireAdmin(request, ctx);
  const body = await validateBody(request, (await import("@lanjam/utils")).testRemoteSchema);

  // Normalize host: add http:// if no protocol
  let host = body.host.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(host)) {
    host = `http://${host}`;
  }

  const reachable = await ollamaPing(host);
  if (!reachable) {
    return Response.json({
      ok: false,
      error:
        "Cannot connect to the remote Ollama server. Check the URL and ensure it is reachable from this network.",
    });
  }

  const version = await ollamaVersion(host);
  const models = await ollamaListModels(host);

  return Response.json({
    ok: true,
    host,
    version,
    models: models.map((m) => ({ name: m.name, size: m.size })),
  });
}

export async function connectRemoteModel(request: Request, ctx: ApiContext) {
  await requireAdmin(request, ctx);
  const body = await validateBody(
    request,
    (await import("@lanjam/utils")).connectRemoteModelSchema,
  );

  const reachable = await ollamaPing(body.host);
  if (!reachable) {
    return Response.json(
      { error: { code: "CONNECTION_FAILED", message: "Remote Ollama server is not reachable" } },
      { status: 502 },
    );
  }

  const remoteModels = await ollamaListModels(body.host);
  const modelExists = remoteModels.some((m) => m.name === body.name);
  if (!modelExists) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: `Model "${body.name}" not found on remote server` } },
      { status: 404 },
    );
  }

  await ctx.repos.llmModels.upsert({ name: body.name, host: body.host, is_installed: true });

  return Response.json({ ok: true });
}

export async function disconnectRemoteModel(request: Request, ctx: ApiContext) {
  await requireAdmin(request, ctx);
  const body = await validateBody(
    request,
    (await import("@lanjam/utils")).disconnectRemoteModelSchema,
  );

  await ctx.repos.llmModels.delete(body.name, body.host);

  return Response.json({ ok: true });
}

export async function startOllama(request: Request, ctx: ApiContext) {
  await requireAdmin(request, ctx);
  const result = await ollamaStart();
  return Response.json(result, { status: result.ok ? 200 : 502 });
}

export async function resetSystem(request: Request, ctx: ApiContext) {
  await requireAdmin(request, ctx);
  const body = await request.json();

  if (body?.confirmation !== "reset") {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "You must confirm the reset" } },
      { status: 400 },
    );
  }

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

export async function initializeOwner(request: Request, ctx: ApiContext) {
  await requireAdmin(request, ctx);
  const body = await validateBody(request, ownerSetupSchema);

  const existing = await ctx.repos.systemOwner.find();
  if (existing) {
    return Response.json(
      { error: { code: "CONFLICT", message: "Owner account already initialized" } },
      { status: 409 },
    );
  }

  const passcode_hash = await hashPasscode(body.passcode);
  const recoveryKey = generateRecoveryKey();
  const recovery_key_hash = hashSessionToken(recoveryKey);

  await ctx.repos.systemOwner.create({ passcode_hash, recovery_key_hash });

  return Response.json({ ok: true, recoveryKey });
}

export async function regenerateOwnerRecoveryKey(request: Request, ctx: ApiContext) {
  await requireAdmin(request, ctx);

  const owner = await ctx.repos.systemOwner.find();
  if (!owner) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Owner account not initialized" } },
      { status: 404 },
    );
  }

  const recoveryKey = generateRecoveryKey();
  const recovery_key_hash = hashSessionToken(recoveryKey);
  await ctx.repos.systemOwner.updateRecoveryKeyHash(owner.id, recovery_key_hash);

  return Response.json({ ok: true, recoveryKey });
}
