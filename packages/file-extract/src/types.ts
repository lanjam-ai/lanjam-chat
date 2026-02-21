export interface ExtractResult {
  text: string;
  metadata: Record<string, unknown>;
}

export interface Extractor {
  canHandle(mime: string, ext: string): boolean;
  extract(buffer: Buffer): Promise<ExtractResult>;
}
