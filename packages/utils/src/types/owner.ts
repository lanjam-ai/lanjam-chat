import { z } from "zod";
import { MIN_PASSCODE_LENGTH } from "../constants.js";

export const ownerLoginSchema = z.object({
  passcode: z.string().min(1),
});
export type OwnerLoginInput = z.infer<typeof ownerLoginSchema>;

export const ownerRecoverSchema = z.object({
  recoveryKey: z.string().min(1),
  newPasscode: z.string().min(MIN_PASSCODE_LENGTH),
});
export type OwnerRecoverInput = z.infer<typeof ownerRecoverSchema>;

export const ownerResetUserPasscodeSchema = z.object({
  newPasscode: z.string().min(MIN_PASSCODE_LENGTH),
});
export type OwnerResetUserPasscodeInput = z.infer<typeof ownerResetUserPasscodeSchema>;

export const ownerSetupSchema = z.object({
  passcode: z.string().min(MIN_PASSCODE_LENGTH),
});
export type OwnerSetupInput = z.infer<typeof ownerSetupSchema>;
