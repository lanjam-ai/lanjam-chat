FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/api/package.json packages/api/
COPY packages/db/package.json packages/db/
COPY packages/utils/package.json packages/utils/
COPY packages/file-extract/package.json packages/file-extract/
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app .
COPY . .
RUN pnpm build

FROM base AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/build ./apps/web/build
COPY --from=build /app/apps/web/package.json ./apps/web/
COPY --from=build /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/packages/api ./packages/api
COPY --from=build /app/packages/utils ./packages/utils
COPY --from=build /app/packages/file-extract ./packages/file-extract
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh \
    && ln -s $(ls -d /app/node_modules/.pnpm/argon2@*/node_modules/argon2) /app/apps/web/node_modules/argon2 \
    && npm install -g tsx
EXPOSE 3000
CMD ["/app/entrypoint.sh"]
