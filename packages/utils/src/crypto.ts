import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";

export async function hashPasscode(passcode: string): Promise<string> {
  return argon2.hash(passcode, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPasscode(hash: string, passcode: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, passcode);
  } catch {
    return false;
  }
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateRecoveryKey(): string {
  const bytes = randomBytes(15);
  const hex = bytes.toString("hex").toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 16)}-${hex.slice(16, 24)}-${hex.slice(24, 30)}`;
}
