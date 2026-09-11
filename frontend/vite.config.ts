/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const realApi = env.VITE_API_MODE === "real";
  const apiTarget = env.VITE_API_TARGET || "http://localhost:4021";

  return {
    plugins: [react(), tailwindcss()],
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
      environment: "jsdom",
      globals: false,
      setupFiles: ["./tests/setup.ts"],
      include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    },
  };
});
