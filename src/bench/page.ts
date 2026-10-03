// Bench page (bench.html). Runs one scenario through each requested renderer, one at a time, and publishes
// the result on window.__bench for bench/run.ts. Query: ?name=&points=&series=&frames=&warmup=&seed=&ingestHz=&renderers=
import { Canvas2DBackend } from "../baselines/canvas2d";
import { UPlotBackend } from "../baselines/uplot";
import { MARGINS } from "../chart/axes";
import type { BackendKind } from "../chart/backend";
import { Chart, type BackendFactory } from "../chart/Chart";
import { makeDataset, yExtent } from "../core/dataset";
import { acquireDevice, type AcquiredDevice } from "../gpu/device";
import { WebGpuBackend } from "../gpu/WebGpuBackend";
import type { RendererResult, ScenarioResult } from "./report";
import { runRenderer } from "./runner";
import { SCRIPT_ID, makeScript, totalAppend } from "./script";

/** Fixed start time so every run uses identical timestamps. 2026-10-04T00:00:00Z. */
export const BENCH_START_MS = Date.UTC(2026, 9, 4);
export const PLOT = { width: 1600, height: 600 };

export interface PageResult {
  scenario: ScenarioResult;
  env: {
    ua: string;
    adapter: AcquiredDevice["adapter"] | null;
    dpr: number;
    canvas: [number, number];
    crossOriginIsolated: boolean;
  };
}

declare global {
  interface Window {
    __bench?: { done: boolean; result?: PageResult; error?: string };
  }
}

const num = (q: URLSearchParams, k: string, d: number) => {
  const v = Number(q.get(k) ?? d);
  if (!Number.isFinite(v) || v < 0) throw new Error(`bad query parameter ${k}=${q.get(k)}`);
  return v;
};

async function main(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const name = q.get("name") ?? "adhoc";
  const points = num(q, "points", 1_000_000);
  const series = num(q, "series", 4);
  const frames = num(q, "frames", 600);
  const warmup = num(q, "warmup", 60);
  const seed = num(q, "seed", 42);
  const ingestHz = num(q, "ingestHz", 1000);
  const renderers = (q.get("renderers") ?? "webgpu,canvas2d,uplot").split(",") as BackendKind[];
  const status = document.getElementById("status")!;
  const stage = document.getElementById("stage")!;

  status.textContent = "generating data";
  const script = makeScript({ frames, startMs: BENCH_START_MS, points, stepMs: 1, ingestHz });
  const data = makeDataset({ seed, series, points: points + totalAppend(script), startMs: BENCH_START_MS, stepMs: 1 });
  const yRange = yExtent(data);
  const ids = Array.from({ length: series }, (_, i) => `s${i}`);
  const results: ScenarioResult["results"] = {};
  let adapter: AcquiredDevice["adapter"] | null = null;

  for (const kind of renderers) {
    status.textContent = `running ${kind}`;
    const host = document.createElement("div");
    host.style.cssText = `width:${PLOT.width + MARGINS.left + MARGINS.right}px;height:${PLOT.height + MARGINS.top + MARGINS.bottom}px`;
    stage.appendChild(host);
    let chart: Chart | null = null;
    try {
      let factory: BackendFactory;
      if (kind === "webgpu") {
        const acq = await acquireDevice(undefined, { timestamps: true });
        adapter = acq.adapter;
        factory = (h, theme) => WebGpuBackend.create(h, acq, { background: theme.background, gpuTiming: true });
      } else if (kind === "canvas2d") {
        factory = (h, theme) => Canvas2DBackend.create(h, theme.background);
      } else if (kind === "uplot") {
        factory = (h, theme) => UPlotBackend.create(h, theme);
      } else {
        throw new Error(`unknown renderer "${kind}"`);
      }
      chart = await Chart.create(host, factory, { capacity: points, autoStart: false, interactive: false, utcLabels: true });
      for (const id of ids) chart.addSeries(id);
      chart.setYRange(yRange);
      const c = chart;
      const run = await runRenderer(c, data, points, script, {
        seriesIds: ids,
        warmupFrames: warmup,
        raf: (cb) => requestAnimationFrame(cb),
        isVisible: () => document.visibilityState === "visible",
      });
      results[kind] = run satisfies RendererResult;
    } catch (e) {
      results[kind] = { error: e instanceof Error ? e.message : String(e) };
    } finally {
      chart?.destroy();
      host.remove();
    }
  }

  const result: PageResult = {
    scenario: { name, spec: { points, series, frames, warmup, ingestHz, seed, script: SCRIPT_ID }, results },
    env: {
      ua: navigator.userAgent,
      adapter,
      dpr: devicePixelRatio,
      canvas: [PLOT.width, PLOT.height],
      crossOriginIsolated: globalThis.crossOriginIsolated === true,
    },
  };
  status.textContent = "done";
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(result, null, 2);
  stage.appendChild(pre);
  window.__bench = { done: true, result };
}

main().catch((e: unknown) => {
  window.__bench = { done: true, error: e instanceof Error ? e.message : String(e) };
});
