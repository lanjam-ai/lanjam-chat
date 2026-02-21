import { z } from "zod";

export const createConversationSchema = z.object({
  title: z.string().max(200).optional(),
  safe_mode: z.boolean().optional(),
  llm_model_id: z.string().uuid().optional(),
  group_id: z.string().uuid().nullable().optional(),
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const updateConversationSchema = z.object({
  title: z.string().max(200).optional(),
  is_archived: z.boolean().optional(),
  group_id: z.string().uuid().nullable().optional(),
  safe_mode: z.boolean().optional(),
  llm_model_id: z.string().uuid().nullable().optional(),
});
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;

export const listConversationsSchema = z.object({
  archived: z.coerce.boolean().optional(),
  q: z.string().optional(),
  tag: z.string().optional(),
  group: z.string().uuid().optional(),
});
export type ListConversationsInput = z.infer<typeof listConversationsSchema>;
