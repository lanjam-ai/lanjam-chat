#!/bin/sh
set -e

echo "Enabling pgvector extension..."
cd /app/packages/db
npx tsx src/enable-extensions.ts

echo "Running database migrations..."
npx tsx src/migrate.ts
cd /app
echo "Starting LanJAM..."
cd /app/apps/web
exec npx react-router-serve ./build/server/index.js
