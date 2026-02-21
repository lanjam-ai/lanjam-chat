import { z } from "zod";
import { MIN_PASSCODE_LENGTH } from "../constants.js";

export const loginSchema = z.object({
  userId: z.string().uuid(),
  passcode: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const setupAdminSchema = z.object({
  name: z.string().min(1).max(50).trim(),
  passcode: z.string().min(MIN_PASSCODE_LENGTH),
});
export type SetupAdminInput = z.infer<typeof setupAdminSchema>;
