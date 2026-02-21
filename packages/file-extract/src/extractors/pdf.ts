import pdfParse from "pdf-parse";
import type { ExtractResult, Extractor } from "../types.js";

export class PdfTextExtractor implements Extractor {
  canHandle(mime: string, ext: string): boolean {
    return mime === "application/pdf" || ext.toLowerCase() === "pdf";
  }

  async extract(buffer: Buffer): Promise<ExtractResult> {
    const data = await pdfParse(buffer);
    return {
      text: data.text,
      metadata: {
        pageCount: data.numpages,
        info: data.info,
      },
    };
  }
}
