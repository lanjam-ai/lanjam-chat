import { z } from "zod";
import { MIN_PASSCODE_LENGTH, UI_THEMES, USER_ROLES } from "../constants.js";

export const createUserSchema = z.object({
  name: z.string().min(1).max(50).trim(),
  role: z.enum(USER_ROLES),
  passcode: z.string().min(MIN_PASSCODE_LENGTH),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  is_disabled: z.boolean().optional(),
  passcode: z.string().min(MIN_PASSCODE_LENGTH).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateMeSchema = z.object({
  name: z.string().min(1).max(50).trim().optional(),
  passcode: z.string().min(MIN_PASSCODE_LENGTH).optional(),
  ui_theme: z.enum(UI_THEMES).optional(),
  safe_mode_enabled: z.boolean().optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export interface PublicUser {
  id: string;
  name: string;
  is_disabled: boolean;
}

export interface User {
  id: string;
  name: string;
  role: string;
  is_disabled: boolean;
  ui_theme: string;
  created_at: Date;
  updated_at: Date;
}
