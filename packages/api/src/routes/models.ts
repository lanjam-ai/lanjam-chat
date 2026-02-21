import { AppError } from "@lanjam/utils";
import type { ApiContext } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { ollamaListModels } from "../services/ollama.js";

export async function listModels(request: Request, ctx: ApiContext) {
  const authCtx = await requireAuth(request, ctx);
  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");

  const user = authCtx.user;
  const role = user.role;

  // Sync local DB records with what Ollama actually has installed
  try {
    const ollamaModels = await ollamaListModels();
    const ollamaNames = new Set(ollamaModels.map((m) => m.name));
    const dbModels = await ctx.repos.llmModels.list();
    for (const dbModel of dbModels) {
      if (dbModel.host === null && dbModel.is_installed && !ollamaNames.has(dbModel.name)) {
        await ctx.repos.llmModels.upsert({ name: dbModel.name, is_installed: false });
      }
    }
  } catch {
    // Ollama may be unreachable — skip sync, use DB as-is
  }

  // Determine safe mode: user-level or conversation-level
  let safeMode = user.safe_mode_enabled;
  if (conversationId) {
    const conv = await ctx.repos.conversations.getById(authCtx.userId, conversationId);
    if (conv?.safe_mode === true) safeMode = true;
  }

  const models = await ctx.repos.llmModels.listForUser(role, safeMode);
  const active = await ctx.repos.llmModels.getActive();

  // If teen/child has no allowed models, fall back to including the active model
  if (models.length === 0 && active && (role === "teen" || role === "child")) {
    models.push(active);
  }

  // Get conversation's selected model if requested
  let conversationModel: { id: string; name: string; host: string | null } | null = null;
  if (conversationId) {
    const conv = await ctx.repos.conversations.getById(authCtx.userId, conversationId);
    if (conv?.llm_model_id) {
      const model = await ctx.repos.llmModels.findById(conv.llm_model_id);
      if (model) conversationModel = { id: model.id, name: model.name, host: model.host };
    }
  }

  // Get acknowledged model IDs for this user
  const acknowledgedModelIds = await ctx.repos.userModelAcknowledgments.getAcknowledgedModelIds(
    authCtx.userId,
  );

  return Response.json({
    models: models.map((m) => ({ id: m.id, name: m.name, host: m.host })),
    active: active ? { id: active.id, name: active.name, host: active.host } : null,
    conversationModel,
    acknowledgedModelIds,
  });
}

export async function acknowledgeModel(request: Request, ctx: ApiContext, modelId: string) {
  const authCtx = await requireAuth(request, ctx);

  const model = await ctx.repos.llmModels.findById(modelId);
  if (!model) {
    throw new AppError("NOT_FOUND", "Model not found", 404);
  }

  await ctx.repos.userModelAcknowledgments.acknowledge(authCtx.userId, modelId);

  return Response.json({ ok: true });
}
