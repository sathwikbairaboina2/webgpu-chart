// Runs the bench scenarios in host Chrome against the production build and writes bench/results/*.json.
// Usage: pnpm build && pnpm bench            (full run, writes <date>-chrome-<gpu>.json and latest.json)
//        pnpm bench -- --quick                (tiny run, writes quick.json, which git ignores)
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import type { PageResult } from "../src/bench/page";
import type { BenchFile, ScenarioResult } from "../src/bench/report";

const root = resolve(import.meta.dirname, "..");
const PORT = 5434;
const CHROME_ARGS = ["--disable-frame-rate-limit", "--disable-gpu-vsync"];
const quick = process.argv.includes("--quick");
const frames = quick ? 40 : 600;
const warmup = quick ? 5 : 60;

const SCENARIOS = quick
  ? [{ name: "4x100k", points: 100_000, series: 4, renderers: "webgpu,canvas2d,uplot" }]
  : [
      { name: "4x1M", points: 1_000_000, series: 4, renderers: "webgpu,canvas2d,uplot" },
      { name: "4x100k", points: 100_000, series: 4, renderers: "webgpu,canvas2d,uplot" },
      { name: "4x2M", points: 2_000_000, series: 4, renderers: "webgpu" },
      { name: "4x5M", points: 5_000_000, series: 4, renderers: "webgpu" },
    ];

function gpuNames(): string[] {
  try {
    if (process.platform === "win32") {
      const out = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController).Name"', { encoding: "utf8" });
      return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    }
  } catch {
    // fall through to the adapter info in the page result
  }
  return [];
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
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
  if (!existsSync(join(root, "dist/demo/bench.html"))) {
    console.error("dist/demo/bench.html is missing. Run pnpm build first.");
    process.exit(1);
  }
  const server = spawn(`pnpm exec vite preview --port ${PORT} --strictPort`, { cwd: root, shell: true, stdio: "ignore" });
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: CHROME_ARGS });
  try {
    await waitForServer(`http://localhost:${PORT}/bench.html`, 30_000);
    const scenarios: ScenarioResult[] = [];
    let env: PageResult["env"] | null = null;
    for (const sc of SCENARIOS) {
      const page = await browser.newPage({ viewport: { width: 1700, height: 900 }, deviceScaleFactor: 1 });
      const q = new URLSearchParams({ name: sc.name, points: String(sc.points), series: String(sc.series), frames: String(frames), warmup: String(warmup), renderers: sc.renderers });
      console.log(`scenario ${sc.name}: ${sc.renderers}`);
      await page.goto(`http://localhost:${PORT}/bench.html?${q}`);
      await page.waitForFunction(() => window.__bench?.done === true, null, { timeout: 20 * 60_000, polling: 1000 });
      const out = await page.evaluate(() => window.__bench!);
      await page.close();
      if (out.error || !out.result) throw new Error(`bench page failed: ${out.error}`);
      scenarios.push(out.result.scenario);
      env ??= out.result.env;
      for (const [k, r] of Object.entries(out.result.scenario.results)) {
        console.log(`  ${k.padEnd(8)} ${"error" in r ? `error: ${r.error}` : `p50 ${r.frameMs.p50.toFixed(2)} ms  p95 ${r.frameMs.p95.toFixed(2)} ms  p99 ${r.frameMs.p99.toFixed(2)} ms  hash ${r.inputHash}`}`);
      }
    }
    const date = new Date().toLocaleDateString("en-CA");
    const file: BenchFile = {
      schema: 1,
      date,
      env: {
        ua: env!.ua,
        adapter: env!.adapter,
        gpuNames: gpuNames(),
        cpu: os.cpus()[0]?.model.trim() ?? "unknown CPU",
        os: `${os.type()} ${os.release()}`,
        dpr: env!.dpr,
        canvas: env!.canvas,
        crossOriginIsolated: env!.crossOriginIsolated,
        chromeArgs: CHROME_ARGS,
      },
      scenarios,
    };
    const dir = join(root, "bench/results");
    mkdirSync(dir, { recursive: true });
    const json = `${JSON.stringify(file, null, 2)}\n`;
    if (quick) {
      writeFileSync(join(dir, "quick.json"), json);
      console.log("wrote bench/results/quick.json");
    } else {
      const slug = [file.env.adapter?.vendor, file.env.adapter?.architecture].filter(Boolean).join("-") || "unknown";
      const name = `${date}-chrome-${slug}.json`;
      writeFileSync(join(dir, name), json);
      writeFileSync(join(dir, "latest.json"), json);
      console.log(`wrote bench/results/${name} and bench/results/latest.json`);
    }
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
