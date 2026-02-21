import { z } from "zod";

export const createMessageSchema = z.object({
  content: z.string().min(1),
  fileIds: z.array(z.string().uuid()).optional(),
  modelName: z.string().min(1).optional(),
  modelHost: z.string().min(1).nullable().optional(),
  editMessageId: z.string().uuid().optional(),
});
export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export interface OllamaResponseMetadata {
  total_duration_ns: number;
  prompt_eval_count: number;
  eval_count: number;
  eval_duration_ns: number;
}

export interface ChatStreamEvent {
  type: "token" | "done" | "error" | "title";
  data: string;
}
