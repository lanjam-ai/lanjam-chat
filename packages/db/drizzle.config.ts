import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

// Load root .env when DATABASE_URL is not already set (e.g. drizzle-kit CLI)
if (!process.env.DATABASE_URL) {
  // drizzle-kit transpiles to CJS, so import.meta.dirname may not be available
  const dir =
    typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(dir, "../../.env");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
