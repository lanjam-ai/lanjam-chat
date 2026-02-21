import type { ExtractResult, Extractor } from "../types.js";

export class HtmlExtractor implements Extractor {
  canHandle(mime: string, ext: string): boolean {
    const lower = ext.toLowerCase();
    return mime === "text/html" || lower === "html" || lower === "htm";
  }

  async extract(buffer: Buffer): Promise<ExtractResult> {
    let html = buffer.toString("utf-8");

    // Remove script and style blocks
    html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
    html = html.replace(/<style[\s\S]*?<\/style>/gi, "");

    // Remove HTML comments
    html = html.replace(/<!--[\s\S]*?-->/g, "");

    // Replace block-level tags with newlines
    html = html.replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, "\n");
    html = html.replace(/<br\s*\/?>/gi, "\n");

    // Remove remaining tags
    html = html.replace(/<[^>]+>/g, "");

    // Decode common HTML entities
    html = html
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");

    // Collapse whitespace
    const text = html
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n");

    return {
      text,
      metadata: { format: "html", length: text.length },
    };
  }
}
