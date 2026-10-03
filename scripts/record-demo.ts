// Records the demo with Playwright in host Chrome (production build on port 5435) to demo-video/demo.webm.
// Usage: pnpm build && pnpm demo:record && pnpm demo:gif
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const PORT = 5435;
const SIZE = { width: 1280, height: 1000 };

async function waitForServer(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview server did not start on ${url}`);
}

async function main(): Promise<void> {
  if (!existsSync(join(root, "dist/demo/index.html"))) throw new Error("dist/demo is missing. Run pnpm build first.");
  const outDir = join(root, "demo-video");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const server = spawn(`pnpm exec vite preview --port ${PORT} --strictPort`, { cwd: root, shell: true, stdio: "ignore" });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    await waitForServer(`http://localhost:${PORT}/`);
    const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: outDir, size: SIZE } });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/?points=1000000&series=4&ingest=1000`);
    await page.waitForFunction(() => document.body.dataset.ready === "true", null, { timeout: 60_000 });
    await page.waitForTimeout(3000);
    const toggle = (kind: string) => page.getByTestId(`pane-${kind}`).getByRole("button").click();
    await toggle("canvas2d");
    await page.waitForTimeout(3000);
    await toggle("canvas2d");
    await toggle("uplot");
    await page.waitForTimeout(3000);
    await toggle("uplot");
    const box = (await page.getByTestId("pane-webgpu").boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, -500);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(1200);
    await page.mouse.dblclick(box.x + box.width * 0.6, box.y + box.height * 0.6);
    await page.waitForTimeout(1500);
    const video = page.video();
    await ctx.close();
    const src = await video!.path();
    renameSync(src, join(outDir, "demo.webm"));
    console.log("wrote demo-video/demo.webm");
  } finally {
    await browser.close();
    if (process.platform === "win32" && server.pid) execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
    else server.kill();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
