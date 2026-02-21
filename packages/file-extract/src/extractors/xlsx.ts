import * as XLSX from "xlsx";
import type { ExtractResult, Extractor } from "../types.js";

const XLSX_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

export class XlsxExtractor implements Extractor {
  canHandle(mime: string, ext: string): boolean {
    const lower = ext.toLowerCase();
    return XLSX_MIMES.has(mime) || lower === "xlsx" || lower === "xls";
  }

  async extract(buffer: Buffer): Promise<ExtractResult> {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const parts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      // Convert sheet to CSV for readable text representation
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      if (csv.trim()) {
        parts.push(`--- Sheet: ${sheetName} ---\n${csv}`);
      }
    }

    return {
      text: parts.join("\n\n"),
      metadata: {
        format: "xlsx",
        sheetCount: workbook.SheetNames.length,
        sheetNames: workbook.SheetNames,
      },
    };
  }
}
