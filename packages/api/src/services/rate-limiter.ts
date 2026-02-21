import { LOGIN_LOCKOUT_MINUTES, LOGIN_MAX_FAILURES } from "@lanjam/utils";

interface FailureRecord {
  count: number;
  lockedUntil: number | null;
}

const failures = new Map<string, FailureRecord>();

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const record = failures.get(key);
  if (!record) return { allowed: true };

  if (record.lockedUntil) {
    const now = Date.now();
    if (now < record.lockedUntil) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((record.lockedUntil - now) / 1000),
      };
    }
    // Lock expired, reset
    failures.delete(key);
    return { allowed: true };
  }

  return { allowed: true };
}

export function recordFailure(key: string): void {
  const record = failures.get(key) ?? { count: 0, lockedUntil: null };
  record.count++;

  if (record.count >= LOGIN_MAX_FAILURES) {
    record.lockedUntil = Date.now() + LOGIN_LOCKOUT_MINUTES * 60 * 1000;
  }

  failures.set(key, record);
}

export function clearFailures(key: string): void {
  failures.delete(key);
}
