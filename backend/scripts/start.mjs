// Production entry for the backend container. Applies migrations once, then runs the API and the
// worker side by side (PROCESS_ROLE=api|worker|all, default all). If either process exits, the
// container exits too, so the platform restarts it instead of leaving half a backend running.
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// the platform starts this from the repository root; migrations and dotenv resolve from backend/
process.chdir(root);
const role = (process.env.PROCESS_ROLE ?? "all").toLowerCase();
const entries = { api: "dist/src/api/main.js", worker: "dist/src/worker/main.js" };
const wanted = role === "all" ? ["api", "worker"] : [role];
if (!wanted.every(name => name in entries)) {
  console.error(`PROCESS_ROLE must be api, worker or all (got "${role}")`);
  process.exit(1);
}

process.env.NODE_ENV ??= "production";

// Both entries migrate on boot; running it once here first keeps them from racing on a fresh database.
const { runMigrations, closeDb } = await import(resolve(root, "dist/src/shared/db/client.js"));
await runMigrations();
await closeDb();

const children = wanted.map(name => {
  const child = spawn(process.execPath, [entries[name]], { cwd: root, stdio: "inherit", env: process.env });
  child.on("exit", (code, signal) => {
    console.error(`[start] ${name} exited (${signal ?? code}); stopping the container`);
    for (const other of children) if (other !== child && other.exitCode === null) other.kill("SIGTERM");
    process.exit(code ?? 1);
  });
  return child;
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    for (const child of children) if (child.exitCode === null) child.kill(signal);
  });
}
