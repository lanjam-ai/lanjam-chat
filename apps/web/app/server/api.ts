import { createApiHandler } from "@lanjam/api";
import { createRepositories } from "@lanjam/db";
import { getDb } from "./db.js";

let handler: ReturnType<typeof createApiHandler> | null = null;

export function getApiHandler() {
  if (!handler) {
    const db = getDb();
    const repos = createRepositories(db);
    handler = createApiHandler({ db, repos });
  }
  return handler;
}

/** Call an API route directly from an SSR loader (avoids self-referential HTTP). */
export function callApi(request: Request, path: string): Promise<Response> {
  const h = getApiHandler();
  return h(
    new Request(new URL(path, request.url), {
      headers: request.headers,
    }),
  );
}
