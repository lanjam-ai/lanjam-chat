import { DocxExtractor } from "./extractors/docx.js";
import { HtmlExtractor } from "./extractors/html.js";
import { PdfTextExtractor } from "./extractors/pdf.js";
import { PlainTextExtractor } from "./extractors/plain-text.js";
import { XlsxExtractor } from "./extractors/xlsx.js";
import type { ExtractResult, Extractor } from "./types.js";

export class ExtractorRegistry {
  private extractors: Extractor[] = [];

  register(extractor: Extractor): void {
    this.extractors.push(extractor);
  }

  async extract(buffer: Buffer, mime: string, filename: string): Promise<ExtractResult> {
    const ext = filename.split(".").pop() ?? "";
    const extractor = this.extractors.find((e) => e.canHandle(mime, ext));
    if (!extractor) {
      throw new Error(`No extractor found for mime="${mime}" ext="${ext}"`);
    }
    return extractor.extract(buffer);
  }

  canExtract(mime: string, filename: string): boolean {
    const ext = filename.split(".").pop() ?? "";
    return this.extractors.some((e) => e.canHandle(mime, ext));
  }
}

export function createDefaultRegistry(): ExtractorRegistry {
  const registry = new ExtractorRegistry();
  registry.register(new HtmlExtractor());
  registry.register(new PdfTextExtractor());
  registry.register(new DocxExtractor());
  registry.register(new XlsxExtractor());
  registry.register(new PlainTextExtractor());
  return registry;
}
