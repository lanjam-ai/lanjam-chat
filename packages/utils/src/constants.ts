export const MAX_UPLOAD_MB = 25;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export const ALLOWED_FILE_TYPES = [
  "txt",
  "md",
  "pdf",
  "docx",
  "xlsx",
  "xls",
  "csv",
  "json",
  "xml",
  "html",
  "htm",
  "rtf",
  "js",
  "ts",
  "jsx",
  "tsx",
  "py",
  "java",
  "c",
  "cpp",
  "h",
  "go",
  "rs",
  "rb",
  "php",
  "sh",
  "bash",
  "yaml",
  "yml",
  "toml",
  "sql",
  "css",
  "scss",
  "log",
  "env",
  "ini",
  "cfg",
  "conf",
] as const;
export type AllowedFileType = (typeof ALLOWED_FILE_TYPES)[number];

export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 150;
export const EMBEDDING_DIMENSIONS = 768;

export const DEFAULT_SESSION_DAYS = 180;
export const OWNER_SESSION_HOURS = 2;
export const DEFAULT_EMBEDDING_MODEL = "nomic-embed-text";

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

export const SUGGESTED_MODELS = [
  {
    name: "llama3.2",
    description: "Small and fast — great for everyday conversations",
    size: "2GB",
  },
  { name: "llama3.1", description: "Good balance of speed and quality", size: "4.7GB" },
  {
    name: "llama3.3",
    description: "Best quality answers, but slower and needs lots of space",
    size: "43GB",
  },
  { name: "mistral", description: "Fast with good answers — a solid all-rounder", size: "4.1GB" },
  { name: "gemma2", description: "Made by Google — high quality responses", size: "5.4GB" },
  {
    name: "phi3",
    description: "Made by Microsoft — small but surprisingly capable",
    size: "2.3GB",
  },
  { name: "qwen2.5", description: "Great with multiple languages", size: "4.7GB" },
  {
    name: "deepseek-r1",
    description: "Good at thinking through problems step by step",
    size: "4.7GB",
  },
] as const;

export const USER_ROLES = ["admin", "adult", "teen", "child"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const UI_THEMES = ["system", "light", "dark"] as const;
export type UiTheme = (typeof UI_THEMES)[number];

export const MESSAGE_ROLES = ["system", "user", "assistant", "tool"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const EXTRACTION_STATUSES = ["pending", "done", "failed"] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export const EMBEDDING_SOURCE_TYPES = ["message", "file_chunk"] as const;
export type EmbeddingSourceType = (typeof EMBEDDING_SOURCE_TYPES)[number];

export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_LOCKOUT_MINUTES = 5;
export const MIN_PASSCODE_LENGTH = 4;

export const SAFETY_RULE_TYPES = ["child", "teen", "adult"] as const;
export type SafetyRuleType = (typeof SAFETY_RULE_TYPES)[number];

export const DEFAULT_SAFETY_RULES: Record<SafetyRuleType, string> = {
  child: `You are a helpful, friendly assistant designed for children. You must:
- Use simple, age-appropriate language suitable for children under 13
- Never discuss violence, weapons, drugs, alcohol, or adult content
- Never use profanity or suggest harmful activities
- If asked about inappropriate topics, gently redirect the conversation
- Encourage learning, creativity, and positive interactions
- Never share or request personal information
- If unsure whether content is appropriate, err on the side of caution`,

  teen: `You are a helpful assistant designed for teenagers. You must:
- Keep all content appropriate for ages 13-16
- Avoid explicit content, graphic violence, or adult themes
- Do not provide advice on obtaining restricted substances
- Encourage critical thinking and responsible decision-making
- If asked about sensitive topics, provide factual, age-appropriate information
- Support academic learning and personal growth
- Never encourage dangerous or illegal activities`,

  adult: `You are a helpful assistant with content safety enabled. You must:
- Avoid generating explicit sexual content or graphic violence
- Do not provide instructions for harmful or illegal activities
- Maintain a respectful and professional tone
- If asked about sensitive topics, provide balanced, factual information
- Prioritise user wellbeing in all responses`,
};
