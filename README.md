# LanJAM Project Guide

## What is LanJAM?

LanJAM is a self-hosted, LAN-only family ChatGPT style web app. It provides a multi-user chat interface backed by local LLM inference via Ollama, with per-user data isolation, file uploads with RAG (retrieval-augmented generation), and an admin dashboard.

## Architecture

**TurboRepo monorepo** with pnpm workspaces:

```
apps/
  web/           → React Router 7 (framework mode, SSR) + Tailwind v4 + lucide-react
packages/
  api/           → Route handlers, services, middleware (handler→service→repo pattern)
  db/            → Drizzle ORM schemas, repositories, migrations (PostgreSQL + pgvector)
  utils/         → Shared types (Zod), error classes, crypto, text chunker, constants
  file-extract/  → Pluggable file text extraction (plain text, PDF, DOCX)
```

## Key Patterns

- **Handler → Service → Repository**: API handlers validate + orchestrate, services contain business logic for external systems (Ollama, MinIO), repositories are data-access only
- **User-scoped data**: Every repository method requires `userId` — data isolation is enforced at the DB layer, not just the API layer
- **API resource routes**: `apps/web/app/routes/api/*.ts` are thin wrappers that delegate `request` objects to `@lanjam/api` handlers
- **SSE streaming**: Chat and model-pull endpoints stream via Server-Sent Events (POST-based, parsed with ReadableStream on the client)
- **Cookie auth**: httpOnly session cookie, token hashed with SHA-256, argon2id for passcodes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Package Manager | pnpm |
| Monorepo | TurboRepo |
| Web Framework | React Router 7 (SSR, Vite) |
| Styling | Tailwind CSS v4, shadcn/ui patterns |
| ORM | Drizzle ORM |
| Database | PostgreSQL 17 + pgvector |
| Object Storage | MinIO |
| LLM | Ollama (local) |
| Linting/Formatting | Biome |
| Language | TypeScript (strict) |

## Commands

```bash
pnpm install          # Install all dependencies
pnpm dev              # Start dev server (all workspaces)
pnpm build            # Build all packages + app
pnpm lint             # Lint with Biome
pnpm format           # Format with Biome
pnpm check            # Type-check all workspaces
pnpm db:generate      # Generate Drizzle migrations
pnpm db:migrate       # Run migrations
pnpm db:push          # Push schema to DB (dev only)
```

## Dev Setup

1. `docker compose up -d` — starts PostgreSQL + MinIO
2. `pnpm install`
3. Copy `.env.example` to `.env` and fill in values
4. `pnpm db:migrate` — run migrations
5. `pnpm dev` — start the app
6. Visit `http://localhost:5173` — setup flow creates admin user

## Environment Variables

See `.env.example` for all variables. Key ones:
- `DATABASE_URL` — PostgreSQL connection string
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` — MinIO config
- `OLLAMA_HOST` — Ollama API endpoint (default: http://localhost:11434)
- `SESSION_SECRET` — Secret for session token generation

## File Organization

### packages/db
- `src/schema/*.ts` — One file per table (11 tables total)
- `src/repositories/*.ts` — One file per entity, all user-scoped
- `src/client.ts` — DB connection factory

### packages/api
- `src/routes/*.ts` — One file per resource (setup, auth, users, conversations, messages, files, search, admin)
- `src/services/*.ts` — Ollama, MinIO, embedding, rate-limiter
- `src/middleware/*.ts` — Auth, cookie, validation
- `src/handler.ts` — Router matching + error wrapper

### packages/utils
- `src/types/*.ts` — Zod schemas + TypeScript interfaces
- `src/errors.ts` — Error hierarchy (AppError → NotFound, Unauthorized, etc.)
- `src/crypto.ts` — Passcode hashing + session tokens
- `src/chunker.ts` — Text chunking for embeddings

### apps/web
- `app/routes/api/*.ts` — API resource routes (thin wrappers)
- `app/routes/*.tsx` — UI routes (setup, home, chat, settings)
- `app/routes/admin/*.tsx` — Admin pages (status, users, LLM)
- `app/hooks/*.ts` — React hooks (chat streaming, theme)
- `app/server/*.ts` — Server-side singletons (DB, API handler)

## Conventions

- Use Biome for formatting (2-space indent, 100 char width)
- Use Biome for linting (recommended rules)
- Imports sorted by Biome
- All packages export from `src/index.ts`
- Packages use `"exports": { ".": "./src/index.ts" }` for TS-first dev
- Error responses always follow: `{ error: { code: string, message: string } }`
- DB IDs are UUIDs (crypto.randomUUID)
- Timestamps use `new Date()` (stored as timestamptz)
