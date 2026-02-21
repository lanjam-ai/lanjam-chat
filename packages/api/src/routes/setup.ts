import {
  generateRecoveryKey,
  hashPasscode,
  hashSessionToken,
  setupAdminSchema,
} from "@lanjam/utils";
import type { ApiContext } from "../context.js";
import { validateBody } from "../middleware/validate.js";
import { minioPing } from "../services/minio.js";
import { ollamaPing } from "../services/ollama.js";
import { whisperPing } from "../services/whisper.js";

export async function getSetupStatus(request: Request, ctx: ApiContext) {
  const count = await ctx.repos.users.count();
  return Response.json({ needsSetup: count === 0 });
}

export async function getHealthStatus(_request: Request, ctx: ApiContext) {
  const [database, minio, ollama, whisper] = await Promise.all([
    ctx.repos.users
      .count()
      .then(() => true)
      .catch(() => false),
    minioPing(),
    ollamaPing(),
    whisperPing(),
  ]);
  return Response.json({ services: { database, minio, ollama, whisper } });
}

export async function createAdmin(request: Request, ctx: ApiContext) {
  const count = await ctx.repos.users.count();
  if (count > 0) {
    return Response.json(
      { error: { code: "SETUP_DONE", message: "Setup already completed" } },
      { status: 400 },
    );
  }

  const body = await validateBody(request, setupAdminSchema);
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
    role: "admin",
    passcode_hash,
  });

  // Create owner account with same passcode
  let recoveryKey: string | undefined;
  const existingOwner = await ctx.repos.systemOwner.find();
  if (!existingOwner) {
    recoveryKey = generateRecoveryKey();
    const recovery_key_hash = hashSessionToken(recoveryKey);
    await ctx.repos.systemOwner.create({ passcode_hash, recovery_key_hash });
  }

  return Response.json({
    ok: true,
    user: { id: user.id, name: user.name, role: user.role },
    ...(recoveryKey ? { recoveryKey } : {}),
  });
}
