import type { Database } from "@lanjam/db";
import type { Repositories } from "@lanjam/db";

export interface ApiContext {
  db: Database;
  repos: Repositories;
}

export interface AuthContext extends ApiContext {
  userId: string;
  user: {
    id: string;
    name: string;
    role: string;
    is_disabled: boolean;
    ui_theme: string;
    safe_mode_enabled: boolean;
  };
  sessionId: string;
}
