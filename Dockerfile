# Build + run the headless sim on Linux (what the grader does on macOS/Linux).
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @ddl/headless build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/apps/headless/dist/headless.js ./headless.js
ENTRYPOINT ["node", "/app/headless.js"]
