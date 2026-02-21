import { AppError } from "@lanjam/utils";
import type { ApiContext } from "./context.js";
import * as admin from "./routes/admin.js";
import * as auth from "./routes/auth.js";
import * as owner from "./routes/owner.js";
import * as conversations from "./routes/conversations.js";
import * as files from "./routes/files.js";
import * as groups from "./routes/groups.js";
import * as me from "./routes/me.js";
import * as messages from "./routes/messages.js";
import * as models from "./routes/models.js";
import * as safety from "./routes/safety.js";
import * as search from "./routes/search.js";
import * as setup from "./routes/setup.js";
import * as tags from "./routes/tags.js";
import * as transcribe from "./routes/transcribe.js";
import * as users from "./routes/users.js";

type Handler = (request: Request, ctx: ApiContext, ...params: string[]) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
  paramNames: string[];
}

function route(method: string, path: string, handler: Handler): Route {
  const paramNames: string[] = [];
  const patternStr = path.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  return {
    method,
    pattern: new RegExp(`^${patternStr}$`),
    handler,
    paramNames,
  };
}

const routes: Route[] = [
  // Setup & health
  route("GET", "/api/setup/status", setup.getSetupStatus),
  route("GET", "/api/status", setup.getHealthStatus),
  route("POST", "/api/setup/create-admin", setup.createAdmin),

  // Public users
  route("GET", "/api/users/public", users.listPublicUsers),

  // Auth
  route("POST", "/api/auth/login", auth.login),
  route("POST", "/api/auth/logout", auth.logout),
  route("GET", "/api/auth/me", auth.getMe),

  // User settings
  route("PATCH", "/api/me", me.updateMe),

  // Conversations
  route("GET", "/api/conversations", conversations.listConversations),
  route("POST", "/api/conversations", conversations.createConversation),
  route("GET", "/api/conversations/:id", conversations.getConversation),
  route("PATCH", "/api/conversations/:id", conversations.updateConversation),
  route("DELETE", "/api/conversations/:id", conversations.deleteConversation),

  // Messages
  route("GET", "/api/conversations/:id/messages", messages.listMessages),
  route("POST", "/api/conversations/:id/messages", messages.sendMessage),
  route("POST", "/api/conversations/:id/messages/undo-last", messages.undoLastMessage),
  route(
    "POST",
    "/api/conversations/:id/messages/delete-last-exchange",
    messages.deleteLastExchange,
  ),
  route("POST", "/api/conversations/:id/messages/save-cancelled", messages.saveCancelledMessage),
  route("DELETE", "/api/conversations/:id/messages/:messageId", messages.deleteMessage),
  route("POST", "/api/conversations/:id/generate-title", messages.generateTitle),

  // Files
  route("GET", "/api/files", files.listUserFiles),
  route("POST", "/api/conversations/:id/files", files.uploadFile),
  route("GET", "/api/conversations/:id/files", files.listConversationFiles),
  route("POST", "/api/conversations/:id/files/:fileId/link", files.linkFile),
  route("DELETE", "/api/conversations/:id/files/:fileId", files.unlinkFile),
  route("GET", "/api/files/:fileId/download", files.downloadFile),
  route("DELETE", "/api/files/:fileId", files.deleteFile),

  // Tags
  route("GET", "/api/tags", tags.listTags),
  route("POST", "/api/tags", tags.createTag),
  route("PATCH", "/api/tags/:tagId", tags.updateTag),
  route("DELETE", "/api/tags/:tagId", tags.deleteTag),
  route("GET", "/api/conversations/:id/tags", tags.listConversationTags),
  route("PUT", "/api/conversations/:id/tags", tags.setConversationTags),

  // Groups
  route("GET", "/api/groups", groups.listGroups),
  route("POST", "/api/groups", groups.createGroup),
  route("PATCH", "/api/groups/:groupId", groups.updateGroup),
  route("DELETE", "/api/groups/:groupId", groups.deleteGroup),

  // Models (user-facing)
  route("GET", "/api/models", models.listModels),
  route("POST", "/api/models/:modelId/acknowledge", models.acknowledgeModel),

  // Search
  route("GET", "/api/search/conversations", search.searchConversations),

  // Voice transcription
  route("POST", "/api/transcribe", transcribe.transcribeAudio),

  // Admin
  route("GET", "/api/admin/status", admin.getStatus),
  route("GET", "/api/admin/users", admin.listUsers),
  route("POST", "/api/admin/users", admin.createUser),
  route("PATCH", "/api/admin/users/:id", admin.updateUser),
  route("DELETE", "/api/admin/users/:id", admin.deleteUser),
  route("GET", "/api/admin/llm/models", admin.getLlmModels),
  route("POST", "/api/admin/llm/pull", admin.pullModel),
  route("POST", "/api/admin/llm/active", admin.setActiveModel),
  route("DELETE", "/api/admin/llm/models", admin.deleteModel),
  route("PATCH", "/api/admin/llm/models/access", admin.updateModelAccess),
  route("POST", "/api/admin/llm/remote/test", admin.testRemoteConnection),
  route("POST", "/api/admin/llm/remote/connect", admin.connectRemoteModel),
  route("POST", "/api/admin/llm/remote/disconnect", admin.disconnectRemoteModel),
  route("POST", "/api/admin/ollama/start", admin.startOllama),
  route("POST", "/api/admin/system/reset", admin.resetSystem),

  // Safety rules
  route("GET", "/api/admin/safety/rules", safety.getSafetyRules),
  route("PATCH", "/api/admin/safety/rules/:type", safety.updateSafetyRule),
  route("POST", "/api/admin/safety/rules/:type/revert", safety.revertSafetyRule),
  route("POST", "/api/admin/safety/rules/:type/reset", safety.resetSafetyRule),

  // Admin — owner management
  route("POST", "/api/admin/owner/initialize", admin.initializeOwner),
  route("POST", "/api/admin/owner/regenerate-recovery-key", admin.regenerateOwnerRecoveryKey),

  // Owner
  route("GET", "/api/owner/status", owner.getOwnerStatus),
  route("POST", "/api/owner/login", owner.login),
  route("POST", "/api/owner/logout", owner.logout),
  route("GET", "/api/owner/me", owner.getMe),
  route("POST", "/api/owner/recover", owner.recover),
  route("GET", "/api/owner/users", owner.listUsers),
  route("POST", "/api/owner/users/:id/reset-passcode", owner.resetUserPasscode),
  route("POST", "/api/owner/system-reset", owner.systemReset),
  route("GET", "/api/owner/audit-log", owner.getAuditLog),
];

export function createApiHandler(ctx: ApiContext) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    for (const r of routes) {
      if (r.method !== method) continue;
      const match = path.match(r.pattern);
      if (!match) continue;

      const params = match.slice(1);
      try {
        return await r.handler(request, ctx, ...params);
      } catch (err) {
        if (err instanceof AppError) {
          return Response.json(
            {
              error: {
                code: err.code,
                message: err.message,
                ...("details" in err ? { details: (err as any).details } : {}),
              },
            },
            { status: err.statusCode },
          );
        }

        console.error("Unhandled API error:", err);
        return Response.json(
          { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
          { status: 500 },
        );
      }
    }

    return Response.json(
      { error: { code: "NOT_FOUND", message: "API route not found" } },
      { status: 404 },
    );
  };
}
