import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "adult", "teen", "child"]);
export const uiThemeEnum = pgEnum("ui_theme", ["system", "light", "dark"]);
export const messageRoleEnum = pgEnum("message_role", ["system", "user", "assistant", "tool"]);
export const extractionStatusEnum = pgEnum("extraction_status", ["pending", "done", "failed"]);
export const embeddingSourceTypeEnum = pgEnum("embedding_source_type", ["message", "file_chunk"]);
