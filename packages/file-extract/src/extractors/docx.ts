import mammoth from "mammoth";
import type { ExtractResult, Extractor } from "../types.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export class DocxExtractor implements Extractor {
  canHandle(mime: string, ext: string): boolean {
    return mime === DOCX_MIME || ext.toLowerCase() === "docx";
  }

  async extract(buffer: Buffer): Promise<ExtractResult> {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value,
      metadata: {
        format: "docx",
        messages: result.messages,
      },
    };
  }
}
