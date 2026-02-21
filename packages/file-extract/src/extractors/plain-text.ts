import type { ExtractResult, Extractor } from "../types.js";

const PLAIN_TEXT_EXTS = new Set([
  "txt",
  "md",
  "csv",
  "json",
  "xml",
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
  "rtf",
]);

export class PlainTextExtractor implements Extractor {
  canHandle(mime: string, ext: string): boolean {
    const lower = ext.toLowerCase();
    if (PLAIN_TEXT_EXTS.has(lower)) return true;
    if (mime.startsWith("text/")) return true;
    if (
      mime === "application/json" ||
      mime === "application/xml" ||
      mime === "application/javascript"
    ) {
      return true;
    }
    return false;
  }

  async extract(buffer: Buffer): Promise<ExtractResult> {
    const text = buffer.toString("utf-8");
    return {
      text,
      metadata: { encoding: "utf-8", length: text.length },
    };
  }
}
