import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./design/tokens.css";
import { App } from "./app/App";
import { API_MODE } from "./lib/hedera";
import { applyChainContrast } from "./design/contrast";

async function boot() {
  if (API_MODE === "mock") {
    const { startMockApi } = await import("./mocks/browser");
    await startMockApi();
  }
  applyChainContrast();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
