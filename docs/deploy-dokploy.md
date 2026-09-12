# Deploying HederaTube on Dokploy (Nixpacks)

Six pieces: Postgres, Redis, Garage (S3), and three applications built with Nixpacks from this repository: **Backend** (API and worker in one container), **Facilitator**, **Frontend**. The frontend and the backend share one public hostname, so the browser talks to `/api` and `/stream` on the same origin.

## 1. Garage

The Dokploy Garage template starts the server but leaves it empty. A fresh Garage accepts no writes until a layout is applied, and it has no bucket and no access key.

**Put it on Dokploy's network.** Applications reach compose services only through `dokploy-network`. Edit the template's compose file so this does not depend on the template's public domain, then redeploy it:

```yaml
services:
  garage:
    image: dxflrs/garage:v2.0.0
    volumes:
      - ../files/garage.toml:/etc/garage.toml
      - garage-storage:/var/lib/garage
    restart: unless-stopped
    expose:
      - 3900
      - 3901
      - 3902
      - 3903
    networks:
      - dokploy-network
volumes:
  garage-storage: {}
networks:
  dokploy-network:
    external: true
```

The template also exposes the S3 API (port 3900) on a public domain. HederaTube uploads go through the backend (`UPLOAD_MODE=proxy`), so that domain can be removed.

**Initialise it once.** The image has no shell, so Dokploy's container terminal cannot open it. On the server, over SSH:

```bash
C=$(docker ps --filter "name=garage" --format '{{.Names}}' | head -1)
docker exec "$C" /garage status                       # copy the node id (first column)
docker exec "$C" /garage layout assign -z dc1 -c 20G <node-id>
docker exec "$C" /garage layout apply --version 1
docker exec "$C" /garage bucket create hederatube
docker exec "$C" /garage key create hederatube-app    # prints Key ID and Secret key
docker exec "$C" /garage bucket allow --read --write --owner hederatube --key hederatube-app
```

Keep the key id and secret for the backend. `20G` is the capacity Garage may use; set what the disk allows.

## 2. Build settings for all three applications

| Setting | Value |
| --- | --- |
| Source | This repository, branch `main` |
| Build Type | Nixpacks |
| Build Path | `/` (the repository root; every app links `x402/typescript` from there) |
| `NIXPACKS_CONFIG_FILE` | `backend/nixpacks.toml`, `facilitator/nixpacks.toml` or `frontend/nixpacks.toml` |

The configs pin Node 22.19 and pnpm 11.1.1, install and build only the `x402` packages each app needs, then build the app. Frontend `VITE_*` variables are read at build time, so a change to them needs a rebuild, not just a restart.

## 3. Facilitator

No domain: it must stay internal, because `/settle` has no authentication of its own. Port 4022.

| Variable | Value |
| --- | --- |
| `NIXPACKS_CONFIG_FILE` | `facilitator/nixpacks.toml` |
| `HEDERA_ACCOUNT_ID`, `HEDERA_PRIVATE_KEY` | Operator account that pays gas (from your local `facilitator/.env`) |
| `HEDERA_NETWORK` | `hedera:testnet` |
| `HEDERA_MIRROR_NODE_URL` | `https://testnet.mirrornode.hedera.com` |
| `PORT` | `4022` |

Do **not** set `HEDERA_RECEIVER_AUTHORIZER_*` here; that key belongs to the backend.

## 4. Backend

Domains: the public hostname with path `/api`, and the same hostname with path `/stream`, both to container port 4021, **Strip Path off**. The container runs migrations, then the API and the worker (transcode and settlement). Set `PROCESS_ROLE=api` and deploy a second copy with `PROCESS_ROLE=worker` if you ever want them apart.

| Variable | Value |
| --- | --- |
| `NIXPACKS_CONFIG_FILE` | `backend/nixpacks.toml` |
| `PORT` | `4021` |
| `PUBLIC_BASE_URL` | `https://<your-host>` |
| `DATABASE_URL` | Postgres internal connection URL from Dokploy |
| `REDIS_URL` | Redis internal connection URL from Dokploy |
| `STORAGE_DRIVER` | `s3` |
| `S3_ENDPOINT` | `http://garage:3900` (if it does not resolve, use the Garage container name) |
| `S3_REGION` | `garage` (matches `s3_region` in the template's `garage.toml`) |
| `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | `hederatube` and the key from step 1 |
| `UPLOAD_MODE` | `proxy` |
| `FACILITATOR_URL` | `http://<facilitator app name>:4022` (the App Name on the facilitator's General tab) |
| `HEDERA_NETWORK`, `HEDERA_MIRROR_NODE_URL`, `HEDERA_JSON_RPC_URL`, `HEDERA_USDC_TOKEN_ID` | `hedera:testnet`, `https://testnet.mirrornode.hedera.com`, `https://testnet.hashio.io/api`, `0.0.429274` |
| `HEDERA_OPERATOR_ACCOUNT_ID`, `HEDERA_OPERATOR_PRIVATE_KEY` | Faucet account (from your local `backend/.env`) |
| `HEDERA_RECEIVER_AUTHORIZER_ACCOUNT_ID`, `HEDERA_RECEIVER_AUTHORIZER_PRIVATE_KEY` | Signs claims and refunds (from your local `backend/.env`) |
| `WORLD_VERIFY_MODE` | `real` |
| `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, `WORLD_ACTION`, `WORLD_ENVIRONMENT` | From the World Developer Portal; `WORLD_ENVIRONMENT` must match the frontend |
| `DEV_ENDPOINTS` | `false` (the manual settlement trigger has no authentication) |

## 5. Frontend

Domain: the public hostname with path `/`, container port 3000.

| Variable | Value |
| --- | --- |
| `NIXPACKS_CONFIG_FILE` | `frontend/nixpacks.toml` |
| `VITE_PRIVY_APP_ID` | Privy app id |
| `VITE_WORLD_APP_ID`, `VITE_WORLD_ACTION`, `VITE_WORLD_ENVIRONMENT` | Same values as the backend |
| `VITE_HEDERA_NETWORK` | `hedera:testnet` |
| `VITE_MIRROR_NODE_URL`, `VITE_MIRROR_CONTRACT_CALL_URL` | `https://testnet.mirrornode.hedera.com` for both |
| `VITE_HASHIO_RPC` | `https://testnet.hashio.io/api` |

## 6. Outside Dokploy

- **Privy dashboard:** add `https://<your-host>` to the allowed origins.
- **Google OAuth client** (only with custom credentials): the redirect URI stays Privy's callback, nothing to add for the new host.

## Checks after deploy

- `https://<your-host>/api/health` returns 200.
- The backend log shows `api listening` and `worker running`; a transcode or settlement error mentioning S3 means the Garage endpoint, key or bucket permission is wrong.
- Pressing play on a video locks within a few seconds; if it fails with a facilitator error, check `FACILITATOR_URL`.
