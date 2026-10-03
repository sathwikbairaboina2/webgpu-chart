import type { Summary } from "../core/stats";
import type { BackendKind } from "../chart/backend";

export interface BenchEnv {
  ua: string;
  adapter: { vendor: string; architecture: string; description: string } | null;
  /** GPU names from the OS, e.g. "NVIDIA GeForce RTX 4060 Laptop GPU". */
  gpuNames: string[];
  cpu: string;
  os: string;
  dpr: number;
  canvas: [number, number];
  crossOriginIsolated: boolean;
  chromeArgs: string[];
}

export interface RendererResult {
  /** rAF deltas. Kept for reference; with one frame in flight they include the wait for the previous frame. */
  frameMs: Summary;
  /** Per frame, callback start until the GPU/canvas work has finished. The headline metric. */
  completeMs: Summary;
  /** Mean ms per frame, first start to last completion. */
  throughputMs: number;
  gpuMs: Summary | null;
  inputHash: string;
  uploadBytes: number;
}

export interface ScenarioSpec {
  points: number;
  series: number;
  frames: number;
  warmup: number;
  ingestHz: number;
  seed: number;
  script: string;
}

export interface ScenarioResult {
  name: string;
  spec: ScenarioSpec;
  results: Partial<Record<BackendKind, RendererResult | { error: string }>>;
}

export interface BenchFile {
  schema: 1;
  date: string;
  env: BenchEnv;
  scenarios: ScenarioResult[];
}

export const HEADLINE_SCENARIO = "4x1M";
const LABEL: Record<BackendKind, string> = { webgpu: "WebGPU", canvas2d: "Canvas2D", uplot: "uPlot" };
const ORDER: BackendKind[] = ["webgpu", "uplot", "canvas2d"];

const ms = (v: number) => v.toFixed(2);

/** GPU pass summaries with fewer samples than this are not shown as a percentile. */
export const MIN_GPU_SAMPLES = 30;

export function gpuCell(g: Summary | null): string {
  if (!g) return "n/a";
  return g.n < MIN_GPU_SAMPLES ? `n/a (only ${g.n} samples)` : `${ms(g.p95)} (n=${g.n})`;
}

function ok(r: RendererResult | { error: string } | undefined): r is RendererResult {
  return r !== undefined && !("error" in r);
}

export function chromeVersion(ua: string): string {
  return /Chrome\/(\d+)/.exec(ua)?.[1] ?? "unknown";
}

/** GPU (the OS name matching the WebGPU adapter vendor when there are several), CPU and Chrome version. */
export function hardwareLine(env: BenchEnv): string {
  const vendor = env.adapter?.vendor?.toLowerCase() ?? "";
  const named = (vendor && env.gpuNames.find((n) => n.toLowerCase().includes(vendor))) || env.gpuNames[0];
  const gpu = named ?? ([env.adapter?.vendor, env.adapter?.architecture].filter(Boolean).join(" ") || "unknown GPU");
  return `${gpu}, ${env.cpu}, Chrome ${chromeVersion(env.ua)}`;
}

export function renderHeadline(file: BenchFile): string {
  const sc = file.scenarios.find((s) => s.name === HEADLINE_SCENARIO);
  if (!sc) throw new Error(`bench file has no "${HEADLINE_SCENARIO}" scenario`);
  const p95 = (k: BackendKind) => {
    const r = sc.results[k];
    return ok(r) ? `${ms(r.completeMs.p95)} ms` : "n/a";
  };
  return (
    `**${sc.spec.series} series x ${sc.spec.points / 1_000_000}M points: p95 frame time to GPU-complete ${p95("webgpu")} on WebGPU ` +
    `vs ${p95("uplot")} on uPlot and ${p95("canvas2d")} on Canvas2D** ` +
    `(one frame in flight, each frame timed until its GPU work finished, ${hardwareLine(file.env)}, measured ${file.date}).`
  );
}

export function renderTable(file: BenchFile): string {
  const rows = [
    "| Scenario | Renderer | p50 ms | p95 ms | p99 ms | Frames over 16.7 ms | Throughput ms/frame | GPU compute pass p95 ms |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const sc of file.scenarios) {
    for (const k of ORDER) {
      const r = sc.results[k];
      if (r === undefined) continue;
      if (!ok(r)) {
        rows.push(`| ${sc.name} | ${LABEL[k]} | error: ${r.error} | | | | | |`);
        continue;
      }
      const f = r.completeMs;
      rows.push(
        `| ${sc.name} | ${LABEL[k]} | ${ms(f.p50)} | ${ms(f.p95)} | ${ms(f.p99)} | ${f.over16ms} / ${f.n} | ${ms(r.throughputMs)} | ${gpuCell(r.gpuMs)} |`,
      );
    }
  }
  return rows.join("\n");
}

function replaceBetween(text: string, name: string, body: string): string {
  const start = `<!-- ${name}:start -->`;
  const end = `<!-- ${name}:end -->`;
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a < 0 || b < a) throw new Error(`README is missing the ${start} ... ${end} markers`);
  return `${text.slice(0, a + start.length)}\n${body}\n${text.slice(b)}`;
}

/** Writes the headline between its markers; the table too when the text has bench markers (README only). */
export function applyToReadme(readme: string, file: BenchFile): string {
  const withHeadline = replaceBetween(readme, "headline", renderHeadline(file));
  return withHeadline.includes("<!-- bench:start -->") ? replaceBetween(withHeadline, "bench", renderTable(file)) : withHeadline;
}
