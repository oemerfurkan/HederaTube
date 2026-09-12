import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4021),
  LOG_LEVEL: z.string().default("info"),
  PUBLIC_BASE_URL: z.string().default("http://localhost:5173"),

  DATABASE_URL: z.string().default("postgres://localhost:5432/hederatube"),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  /** s3 = Garage/S3-compatible object storage (production); fs = local directory (development). */
  STORAGE_DRIVER: z.enum(["s3", "fs"]).default("fs"),
  STORAGE_FS_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().default("http://localhost:3900"),
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("garage"),
  S3_BUCKET: z.string().default("hederatube"),
  S3_ACCESS_KEY: z.string().default(""),
  S3_SECRET_KEY: z.string().default(""),
  /** proxy = browser PUTs through /api/upload/put (default); presign = direct-to-storage presigned PUT. */
  UPLOAD_MODE: z.enum(["proxy", "presign"]).default("proxy"),

  FACILITATOR_URL: z.string().default("http://localhost:4022"),
  HEDERA_NETWORK: z.enum(["hedera:testnet", "hedera:mainnet"]).default("hedera:testnet"),
  HEDERA_MIRROR_NODE_URL: z.string().optional(),
  HEDERA_JSON_RPC_URL: z.string().default("https://testnet.hashio.io/api"),
  HEDERA_USDC_TOKEN_ID: z.string().default("0.0.429274"),
  HEDERA_OPERATOR_ACCOUNT_ID: z.string().optional(),
  HEDERA_OPERATOR_PRIVATE_KEY: z.string().optional(),
  HEDERA_RECEIVER_AUTHORIZER_ACCOUNT_ID: z.string().optional(),
  HEDERA_RECEIVER_AUTHORIZER_PRIVATE_KEY: z.string().optional(),

  WITHDRAW_DELAY_SECONDS: z.coerce.number().default(900),
  MAX_TIMEOUT_SECONDS: z.coerce.number().default(600),
  FAUCET_HBAR: z.coerce.number().default(5),
  ABANDONED_AFTER_SECONDS: z.coerce.number().default(90),
  SETTLEMENT_INTERVAL_SECONDS: z.coerce.number().default(60),
  MAX_CLAIMS_PER_BATCH: z.coerce.number().default(25),
  DEV_ENDPOINTS: z
    .string()
    .default("true")
    .transform(v => v !== "false"),
  WORLD_VERIFY_MODE: z.enum(["simulate", "real"]).default("simulate"),
  WORLD_APP_ID: z.string().optional(),
  /** Relying-party id and signing key from the World Developer Portal; both required in real mode. */
  WORLD_RP_ID: z.string().optional(),
  WORLD_RP_SIGNING_KEY: z.string().optional(),
  WORLD_ACTION: z.string().default("hederatube-creator"),
  WORLD_ENVIRONMENT: z.enum(["production", "staging", "sandbox"]).default("production"),

  SEED_CREATOR_ACCOUNT_ID: z.string().default("0.0.10463864"),
  SEED_CREATOR_WALLET: z.string().default("0x00000000000000000000000000000000009faa78"),
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env);

export const MIRROR_NODE_URL =
  env.HEDERA_MIRROR_NODE_URL ??
  (env.HEDERA_NETWORK === "hedera:mainnet"
    ? "https://mainnet-public.mirrornode.hedera.com"
    : "https://testnet.mirrornode.hedera.com");
