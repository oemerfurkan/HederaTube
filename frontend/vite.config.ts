/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { createRequire } from "node:module";
import { createReadStream, existsSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";

/**
 * IDKit loads its WebAssembly with `new URL("idkit_wasm_bg.wasm", import.meta.url)`. Vite's dev
 * pre-bundling moves the module into .vite/deps, where that sibling file does not exist, and the
 * SPA fallback then answers the fetch with index.html. This serves the real file for that path in
 * dev; production builds emit the asset through Rollup on their own.
 */
function idkitWasm(): Plugin {
  const require = createRequire(import.meta.url);
  // the package's exports map hides package.json, so walk up from the resolved entry file instead
  const idkitEntry = realpathSync(require.resolve("@worldcoin/idkit"));
  const wasm = resolve(dirname(idkitEntry), "../../idkit-core/dist/idkit_wasm_bg.wasm");
  return {
    name: "hederatube:idkit-wasm",
    configureServer(server) {
      if (!existsSync(wasm)) {
        server.config.logger.warn(`[idkit-wasm] not found at ${wasm}`);
        return;
      }
      server.middlewares.use((req, res, next) => {
        if (!(req.url ?? "").split("?")[0].endsWith("/idkit_wasm_bg.wasm")) return next();
        res.setHeader("content-type", "application/wasm");
        res.setHeader("cache-control", "no-cache");
        createReadStream(wasm).pipe(res);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const realApi = env.VITE_API_MODE === "real";
  const apiTarget = env.VITE_API_TARGET || "http://localhost:4021";

  return {
    plugins: [react(), tailwindcss(), idkitWasm()],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
      port: 5173,
      fs: {
        // @x402/core and @x402/fetch are pnpm `link:` packages living in ../x402
        allow: [".."],
      },
      proxy: realApi
        ? {
            "/api": { target: apiTarget, changeOrigin: false },
            "/stream": { target: apiTarget, changeOrigin: false },
          }
        : undefined,
    },
    test: {
      // Tests always run against the in-process mock, whatever .env says.
      env: { VITE_API_MODE: "mock", VITE_ONBOARD_MODE: "mock", VITE_MIRROR_CONTRACT_CALL_URL: "/mock-mirror", VITE_DEV_PRIVATE_KEY: "", VITE_PRIVY_APP_ID: "" },
      environment: "jsdom",
      globals: false,
      setupFiles: ["./tests/setup.ts"],
      include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    },
  };
});
