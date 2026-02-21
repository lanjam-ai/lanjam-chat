import { z } from "zod";

export const pullModelSchema = z.object({
  name: z.string().min(1).trim(),
});
export type PullModelInput = z.infer<typeof pullModelSchema>;

export const deleteModelSchema = z.object({
  name: z.string().min(1).trim(),
  host: z.string().min(1).trim().nullable().optional(),
});
export type DeleteModelInput = z.infer<typeof deleteModelSchema>;

export const setActiveModelSchema = z.object({
  name: z.string().min(1).trim(),
  host: z.string().min(1).trim().nullable().optional(),
});
export type SetActiveModelInput = z.infer<typeof setActiveModelSchema>;

export const testRemoteSchema = z.object({
  host: z.string().min(1).trim(),
});
export type TestRemoteInput = z.infer<typeof testRemoteSchema>;

export const connectRemoteModelSchema = z.object({
  name: z.string().min(1).trim(),
  host: z.string().min(1).trim(),
});
export type ConnectRemoteModelInput = z.infer<typeof connectRemoteModelSchema>;

export const disconnectRemoteModelSchema = z.object({
  name: z.string().min(1).trim(),
  host: z.string().min(1).trim(),
});
export type DisconnectRemoteModelInput = z.infer<typeof disconnectRemoteModelSchema>;

export const updateModelAccessSchema = z.object({
  name: z.string().min(1).trim(),
  host: z.string().min(1).trim().nullable().optional(),
  allow_teen: z.boolean().optional(),
  allow_child: z.boolean().optional(),
  safe_mode_allowed: z.boolean().optional(),
});
export type UpdateModelAccessInput = z.infer<typeof updateModelAccessSchema>;

export interface LlmModel {
  id: string;
  name: string;
  host: string | null;
  is_installed: boolean;
  is_active: boolean;
  allow_teen: boolean;
  allow_child: boolean;
  safe_mode_allowed: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AvailableModel {
  id: string;
  name: string;
  host: string | null;
}

export interface OllamaModelInfo {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}
