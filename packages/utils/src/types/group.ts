import { z } from "zod";

export const createGroupSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  guidance_text: z.string().max(2000).optional(),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  guidance_text: z.string().max(2000).nullable().optional(),
});
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
