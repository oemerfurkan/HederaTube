FROM node:22-bookworm AS build
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
WORKDIR /repo
COPY x402/typescript ./x402/typescript
RUN cd x402/typescript && pnpm install --frozen-lockfile && pnpm --filter @x402/fetch build
COPY frontend ./frontend
ARG VITE_PRIVY_APP_ID=""
ARG VITE_API_MODE=real
ARG VITE_ONBOARD_MODE=real
ARG VITE_DEV_CONTROLS=true
ARG VITE_WORLD_VERIFY_MODE=simulate
ARG VITE_MIRROR_CONTRACT_CALL_URL=https://testnet.mirrornode.hedera.com
ENV VITE_PRIVY_APP_ID=$VITE_PRIVY_APP_ID VITE_API_MODE=$VITE_API_MODE VITE_ONBOARD_MODE=$VITE_ONBOARD_MODE \
    VITE_DEV_CONTROLS=$VITE_DEV_CONTROLS VITE_WORLD_VERIFY_MODE=$VITE_WORLD_VERIFY_MODE VITE_MIRROR_CONTRACT_CALL_URL=$VITE_MIRROR_CONTRACT_CALL_URL
RUN cd frontend && pnpm install --frozen-lockfile && pnpm build

FROM nginx:alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/frontend/dist /usr/share/nginx/html
