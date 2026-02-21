const COOKIE_NAME = "lanjam_session";
const OWNER_COOKIE_NAME = "lanjam_owner_session";

export function createSessionCookie(token: string, maxAgeSeconds: number): string {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAgeSeconds}`,
  ];
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function createOwnerSessionCookie(token: string, maxAgeSeconds: number): string {
  const parts = [
    `${OWNER_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=/owner`,
    `HttpOnly`,
    `SameSite=Strict`,
    `Max-Age=${maxAgeSeconds}`,
  ];
  return parts.join("; ");
}

export function clearOwnerSessionCookie(): string {
  return `${OWNER_COOKIE_NAME}=; Path=/owner; HttpOnly; SameSite=Strict; Max-Age=0`;
}
