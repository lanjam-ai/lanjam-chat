# LanJAM

A free, open-source, self-hosted AI chat application designed for families. Run your own private AI chat experience on your local network — no cloud services, no subscriptions, no data leaving your home.

## Why LanJAM?

- **Private by design** — conversations, files, and user data never leave your network
- **Family-friendly** — role-based safety system with age-appropriate content filtering
- **Self-hosted** — runs entirely on your own hardware using local AI models via Ollama
- **Multi-user** — each family member gets their own account with isolated data
- **No internet required** — fully functional offline after initial setup

## Features

- Real-time streaming chat with local LLMs (Llama, Gemma, Mistral, and more)
- Voice input via Whisper speech-to-text
- File attachments with text extraction (PDF, DOCX, TXT, Markdown)
- Vector search (RAG) powered by pgvector for document-aware conversations
- Conversation search, pinning, and auto-generated titles
- Message editing with version history
- Light, dark, and system theme support
- Admin dashboard for managing users, models, and system settings
- Support for remote Ollama instances on your local network

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, React Router 7 (SSR), Tailwind CSS 4 |
| API | Custom handler with SSE streaming |
| Database | PostgreSQL 17 with pgvector |
| ORM | Drizzle ORM |
| Object Storage | MinIO (S3-compatible) |
| AI Runtime | Ollama |
| Speech-to-Text | Faster Whisper Server |
| Build | pnpm workspaces, TurboRepo |
| Linting | Biome |

## Project Structure

```
lanjam-chat/
├── apps/
│   └── web/              # React Router frontend (SSR)
├── packages/
│   ├── api/              # API routes and request handling
│   ├── db/               # Drizzle schema, migrations, repositories
│   ├── file-extract/     # PDF/DOCX/TXT text extraction
│   └── utils/            # Shared utilities
├── docker-compose.yml    # PostgreSQL, MinIO, Whisper
├── turbo.json
└── package.json
```

## Prerequisites

- **Node.js** >= 22
- **pnpm** 9.x
- **Docker** and Docker Compose
- **Ollama** installed locally or accessible on your network

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/lanjam-ai/lanjam-chat.git
cd lanjam-chat
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` to set your `SESSION_SECRET` to a random string (at least 32 characters). The defaults work out of the box for local development.

### 3. Start infrastructure

```bash
pnpm docker:up
```

This starts PostgreSQL (with pgvector), MinIO, and Faster Whisper Server.

### 4. Start Ollama

```bash
pnpm ollama:start
```

Or if Ollama is already running as a system service, skip this step.

### 5. Set up the database

```bash
pnpm db:push
```

### 6. Start the dev server

```bash
pnpm dev
```

The app will be available at **http://localhost:5173**. The first user to sign up becomes the admin.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all workspaces in dev mode |
| `pnpm build` | Build all workspaces |
| `pnpm docker:up` | Start Docker services (Postgres, MinIO, Whisper) |
| `pnpm docker:down` | Stop Docker services |
| `pnpm ollama:start` | Start Ollama LLM server |
| `pnpm db:generate` | Generate Drizzle migration files |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:push` | Push schema directly to database |
| `pnpm format` | Format code with Biome |
| `pnpm lint` | Lint code with Biome |
| `pnpm check` | Format + lint with Biome |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://lanjam:lanjam@localhost:5432/lanjam` |
| `MINIO_ENDPOINT` | MinIO host | `localhost` |
| `MINIO_PORT` | MinIO API port | `9100` |
| `MINIO_ACCESS_KEY` | MinIO access key | `minioadmin` |
| `MINIO_SECRET_KEY` | MinIO secret key | `minioadmin` |
| `MINIO_BUCKET` | MinIO bucket name | `family-chat` |
| `OLLAMA_HOST` | Ollama API URL | `http://localhost:11434` |
| `WHISPER_HOST` | Whisper API URL | `http://localhost:8000` |
| `SESSION_SECRET` | Cookie signing secret | *(must be set)* |
| `SESSION_DAYS` | Session expiry in days | `180` |
| `MAX_UPLOAD_MB` | Max file upload size | `25` |
| `ALLOWED_FILE_TYPES` | Comma-separated file extensions | `txt,md,pdf,docx` |
| `ACTIVE_EMBEDDING_MODEL` | Ollama model for embeddings | `nomic-embed-text` |

## Architecture

```
Handler → Service → Repository
```

- **Handlers** validate requests and orchestrate responses
- **Services** contain business logic for external systems (Ollama, MinIO, embeddings)
- **Repositories** are data-access only, all user-scoped for data isolation

API resource routes in `apps/web/app/routes/api/` are thin wrappers that delegate to `@lanjam/api` handlers. Chat streaming uses Server-Sent Events over POST requests.

## Related Projects

- [lanjam-docs](https://github.com/lanjam-ai/lanjam-docs) — Help documentation package
- [lanjam-site](https://github.com/lanjam-ai/lanjam-site) — Marketing website at [lanjam.dev](https://www.lanjam.dev)

## Licence

MIT
