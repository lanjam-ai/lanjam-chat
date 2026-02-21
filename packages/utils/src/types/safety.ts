import { z } from "zod";
import { SAFETY_RULE_TYPES } from "../constants.js";

export const safetyRuleTypeSchema = z.enum(SAFETY_RULE_TYPES);

export const updateSafetyRuleSchema = z.object({
  content: z.string().min(1).max(5000),
});
export type UpdateSafetyRuleInput = z.infer<typeof updateSafetyRuleSchema>;
