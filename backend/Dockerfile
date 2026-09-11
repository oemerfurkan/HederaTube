# Build context = repository root (the backend links to ../x402/typescript packages).
FROM node:22-bookworm AS build
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
WORKDIR /repo
COPY x402/typescript ./x402/typescript
RUN cd x402/typescript && pnpm install --frozen-lockfile \
  && pnpm --filter "@x402/hedera..." build && pnpm --filter @x402/express build && pnpm --filter @x402/fetch build
COPY backend ./backend
RUN cd backend && pnpm install --frozen-lockfile && pnpm build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo/backend
ENV NODE_ENV=production
COPY --from=build /repo/x402/typescript /repo/x402/typescript
COPY --from=build /repo/backend /repo/backend
EXPOSE 4021
CMD ["node", "dist/src/api/main.js"]
