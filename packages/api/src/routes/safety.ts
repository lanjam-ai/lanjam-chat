import {
  DEFAULT_SAFETY_RULES,
  SAFETY_RULE_TYPES,
  type SafetyRuleType,
  updateSafetyRuleSchema,
} from "@lanjam/utils";
import type { ApiContext } from "../context.js";
import { requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

export async function getSafetyRules(request: Request, ctx: ApiContext) {
  await requireAdmin(request, ctx);
  const rows = await ctx.repos.safetyRules.getAll();

  const rules = SAFETY_RULE_TYPES.map((type) => {
    const existing = rows.find((r) => r.type === type);
    if (existing) {
      return {
        id: existing.id,
        type: existing.type,
        content: existing.content,
        previous_content: existing.previous_content,
        is_default: existing.content === DEFAULT_SAFETY_RULES[type],
        has_previous: existing.previous_content !== null,
        updated_at: existing.updated_at,
      };
    }
    return {
      id: null,
      type,
      content: DEFAULT_SAFETY_RULES[type],
      previous_content: null,
      is_default: true,
      has_previous: false,
      updated_at: null,
    };
  });

  return Response.json({ rules });
}

export async function updateSafetyRule(request: Request, ctx: ApiContext, type: string) {
  await requireAdmin(request, ctx);

  if (!SAFETY_RULE_TYPES.includes(type as SafetyRuleType)) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid rule type" } },
      { status: 400 },
    );
  }

  const body = await validateBody(request, updateSafetyRuleSchema);
  const rule = await ctx.repos.safetyRules.upsert(type, body.content);
  return Response.json({ rule });
}

export async function revertSafetyRule(request: Request, ctx: ApiContext, type: string) {
  await requireAdmin(request, ctx);

  if (!SAFETY_RULE_TYPES.includes(type as SafetyRuleType)) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid rule type" } },
      { status: 400 },
    );
  }

  const existing = await ctx.repos.safetyRules.getByType(type);
  if (!existing || !existing.previous_content) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "No previous version to revert to" } },
      { status: 404 },
    );
  }

  const rule = await ctx.repos.safetyRules.upsert(
    type,
    existing.previous_content,
    existing.content,
  );
  return Response.json({ rule });
}

export async function resetSafetyRule(request: Request, ctx: ApiContext, type: string) {
  await requireAdmin(request, ctx);

  if (!SAFETY_RULE_TYPES.includes(type as SafetyRuleType)) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid rule type" } },
      { status: 400 },
    );
  }

  const defaultContent = DEFAULT_SAFETY_RULES[type as SafetyRuleType];
  const rule = await ctx.repos.safetyRules.upsert(type, defaultContent);
  return Response.json({ rule });
}
