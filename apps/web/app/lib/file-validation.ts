import { ALLOWED_FILE_TYPES } from "@lanjam/utils/constants";

const ALLOWED_SET = new Set<string>(ALLOWED_FILE_TYPES);

/** Checks whether a file is of a supported type based on its filename extension. */
export function isFileTypeSupported(filename: string): boolean {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) return false;
  return ALLOWED_SET.has(filename.slice(dot + 1).toLowerCase());
}

/** Splits files into supported and unsupported based on extension. */
export function partitionFilesBySupport(files: File[]): {
  supported: File[];
  unsupported: File[];
} {
  const supported: File[] = [];
  const unsupported: File[] = [];
  for (const f of files) {
    (isFileTypeSupported(f.name) ? supported : unsupported).push(f);
  }
  return { supported, unsupported };
}

/** Human-readable description of supported file types. */
export function getSupportedFileTypesDescription(): string {
  return "Supported types: documents (pdf, docx, txt, md, rtf), spreadsheets (xlsx, xls, csv), data (json, xml, yaml), web (html, css), and code files.";
}

/** Accept string for <input type="file"> */
export const FILE_INPUT_ACCEPT = ALLOWED_FILE_TYPES.map((ext) => `.${ext}`).join(",");
