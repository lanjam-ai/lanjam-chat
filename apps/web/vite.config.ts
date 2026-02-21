import path from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const monorepoRoot = path.resolve(__dirname, "../..");
const workspaceRoot = path.resolve(monorepoRoot, "..");

/** Silently return 404 for well-known / browser probe URLs so they don't spam logs. */
function silentWellKnown(): Plugin {
  return {
    name: "silent-well-known",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith("/.well-known/")) {
          res.statusCode = 404;
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load all env vars from the monorepo root .env into process.env for SSR
  const env = loadEnv(mode, monorepoRoot, "");
  for (const key in env) {
    process.env[key] ??= env[key];
  }

  return {
    envDir: monorepoRoot,
    plugins: [silentWellKnown(), tailwindcss(), reactRouter(), tsconfigPaths()],
    server: {
      fs: {
        allow: [workspaceRoot],
      },
    },
    ssr: {
      external: ["argon2"],
    },
  };
});
