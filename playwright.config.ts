import { defineConfig } from "@playwright/test";

// Port 5433 is this repo's Playwright port (allowed host range 5430-5439).
const port = Number(process.env.E2E_PORT ?? 5433);

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    // Bundled Chromium with navigator.gpu stubbed. Runs in CI (no GPU there anyway).
    { name: "fallback", testDir: "e2e/fallback", use: { browserName: "chromium" } },
    // Installed Chrome on the host: the only browser here that gets a WebGPU adapter (ADR 0003).
    { name: "gpu", testDir: "e2e/gpu", use: { browserName: "chromium", channel: "chrome", viewport: { width: 1280, height: 900 } } },
  ],
});
