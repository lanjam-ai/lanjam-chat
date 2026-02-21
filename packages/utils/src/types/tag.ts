import { z } from "zod";

export const createTagSchema = z.object({
  name: z.string().min(1).max(50).trim(),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

export const updateTagSchema = z.object({
  name: z.string().min(1).max(50).trim(),
});
export type UpdateTagInput = z.infer<typeof updateTagSchema>;

export const setConversationTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()),
});
export type SetConversationTagsInput = z.infer<typeof setConversationTagsSchema>;
