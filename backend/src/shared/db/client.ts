import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";
import { env } from "../env.js";
import * as schema from "./schema.js";

export const sql = postgres(env.DATABASE_URL, { max: 10, onnotice: () => undefined });
export const db = drizzle(sql, { schema });
export type Db = typeof db;

// Both `pnpm dev:*` and the container run from the backend directory.
const migrationsFolder = path.resolve(process.cwd(), "drizzle");

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder });
}

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
