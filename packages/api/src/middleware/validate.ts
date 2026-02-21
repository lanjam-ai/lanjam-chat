import { ValidationError } from "@lanjam/utils";
import type { ZodSchema } from "zod";

export async function validateBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Invalid JSON body");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      if (!details[path]) details[path] = [];
      details[path].push(issue.message);
    }
    throw new ValidationError("Validation failed", details);
  }

  return result.data;
}

export function validateQuery<T>(url: string, schema: ZodSchema<T>): T {
  const searchParams = new URL(url).searchParams;
  const obj = Object.fromEntries(searchParams.entries());
  const result = schema.safeParse(obj);
  if (!result.success) {
    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      if (!details[path]) details[path] = [];
      details[path].push(issue.message);
    }
    throw new ValidationError("Invalid query parameters", details);
  }
  return result.data;
}
