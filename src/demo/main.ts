import "./demo.css";
import { SyntheticSource } from "../adapters/synthetic";
import { Canvas2DBackend } from "../baselines/canvas2d";
import { UPlotBackend } from "../baselines/uplot";
import type { BackendKind, FrameStats } from "../chart/backend";
import { Chart, type BackendFactory } from "../chart/Chart";
import { makeDataset } from "../core/dataset";
import { acquireDevice } from "../gpu/device";
import { isSupported } from "../gpu/support";
import { WebGpuBackend } from "../gpu/WebGpuBackend";

interface Pane {
  kind: BackendKind;
  chart: Chart | null;
  /** The WebGPU pane owns its device; it is destroyed with the chart so rebuilds do not leak devices. */
  device: GPUDevice | null;
  el: HTMLElement;
  stats: HTMLElement;
  toggle: HTMLButtonElement;
  last: FrameStats | null;
  lastGpuMs: number | null;
}

const TITLES: Record<BackendKind, [string, string]> = {
  webgpu: ["WebGPU", "compute-shader decimation"],
  canvas2d: ["Canvas2D", "same decimation on the CPU"],
  uplot: ["uPlot", "its own decimation and axes"],
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
/** GPU timestamps tick in 65.5 us steps, so anything below 0.07 ms is shown as a bound, not as 0.00. */
const fmtGpu = (v: number | null) => (v === null ? "n/a" : v < 0.07 ? "<0.07" : v.toFixed(2));
const fmt = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? "-" : v.toFixed(2));

let panes: Pane[] = [];
let source: SyntheticSource | null = null;
let gpuReason: string | null = null;

function paneShell(kind: BackendKind): Pane {
  const el = document.createElement("section");
  el.className = "pane";
  el.dataset.testid = `pane-${kind}`;
  const [title, sub] = TITLES[kind];
  el.innerHTML = `
    <div class="pane-head">
      <div class="pane-title">${title}<small>${sub}</small></div>
      <div class="stats" data-testid="stats-${kind}">-</div>
      <button type="button" aria-pressed="false">Run</button>
    </div>
    <div class="pane-body"></div>`;
  return {
    kind,
    chart: null,
    device: null,
    el,
    stats: el.querySelector(".stats")!,
    toggle: el.querySelector("button")!,
    last: null,
    lastGpuMs: null,
  };
}

function note(p: Pane, text: string | null): void {
  const body = p.el.querySelector(".pane-body")!;
  p.el.querySelector(".pane-note")?.remove();
  if (text === null) return;
  const n = document.createElement("div");
  n.className = "pane-note";
  n.textContent = text;
  // A strip between the header and the plot, so the text never sits on top of the lines.
  body.before(n);
}

function setRunning(p: Pane, run: boolean): void {
  if (!p.chart) return;
  if (run) p.chart.start();
  else p.chart.stop();
  p.toggle.textContent = run ? "Pause" : "Run";
  p.toggle.setAttribute("aria-pressed", String(run));
  note(p, run ? null : "Paused. Running it shares this page's frame budget with the other panes.");
}

async function factoryFor(p: Pane): Promise<BackendFactory> {
  const kind = p.kind;
  if (kind === "webgpu") {
    const acq = await acquireDevice(undefined, { timestamps: true });
    p.device = acq.device;
    // v0.1 has no device-lost recovery (spec section 3): stop the pane and say so.
    const onDeviceLost = (msg: string) => {
      setRunning(p, false);
      p.toggle.disabled = true;
      note(p, `GPU device lost: ${msg}. Reload the page to start again.`);
    };
    return (h, theme) => WebGpuBackend.create(h, acq, { background: theme.background, gpuTiming: true, onDeviceLost });
  }
  if (kind === "canvas2d") return (h, theme) => Canvas2DBackend.create(h, theme.background);
  return (h, theme) => UPlotBackend.create(h, theme);
}

async function build(points: number, series: number, ingestHz: number): Promise<void> {
  source?.stop();
  for (const p of panes) {
    p.chart?.destroy();
    p.device?.destroy();
  }
  const host = $("panes");
  host.replaceChildren();
  panes = (["webgpu", "canvas2d", "uplot"] as BackendKind[]).map(paneShell);
  for (const p of panes) host.appendChild(p.el);

  const start = Date.now() - points;
  const data = makeDataset({ seed: 7, series, points, startMs: start, stepMs: 1 });
  $("summary").textContent = `${series} series x ${points.toLocaleString("en-US")} points${ingestHz ? ", 1 kHz ingest" : ""}`;

  for (const p of panes) {
    const body = p.el.querySelector<HTMLElement>(".pane-body")!;
    if (p.kind === "webgpu" && gpuReason) {
      p.toggle.disabled = true;
      note(p, `WebGPU unavailable: ${gpuReason}`);
      continue;
    }
    try {
      p.chart = await Chart.create(body, await factoryFor(p), { capacity: points, autoStart: false, windowMs: points });
    } catch (e) {
      p.device?.destroy();
      p.device = null;
      p.toggle.disabled = true;
      note(p, `Could not start: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (let s = 0; s < series; s++) {
      p.chart.addSeries(`s${s}`);
      p.chart.model.append(`s${s}`, data[s].t, data[s].y);
    }
    p.chart.on("frame", (st) => {
      p.last = st;
      if (st.gpuMs !== null) p.lastGpuMs = st.gpuMs;
    });
    p.chart.on("error", (e) => note(p, e.message));
    p.toggle.addEventListener("click", () => setRunning(p, !p.chart?.isRunning));
    p.chart.frame();
    const runByDefault = p.kind === "webgpu" || (p.kind === "canvas2d" && gpuReason !== null);
    setRunning(p, runByDefault);
  }

  if (ingestHz > 0) {
    source = new SyntheticSource({ series, seed: 7, hz: ingestHz });
    source.onBatch((s, t, y) => {
      for (const p of panes) p.chart?.model.append(`s${s}`, t, y);
    });
    source.start(data[0].t[points - 1] + 1);
  }
}

function startReadouts(): void {
  let frames = 0;
  let since = performance.now();
  const count = (t: number) => {
    frames++;
    if (t - since >= 500) {
      $("fps").textContent = String(Math.round((frames * 1000) / (t - since)));
      frames = 0;
      since = t;
    }
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
  setInterval(() => {
    for (const p of panes) {
      if (!p.chart?.isRunning || !p.last) continue;
      const gpu = p.kind === "webgpu" ? ` · GPU pass <b>${fmtGpu(p.lastGpuMs)}</b> ms` : "";
      p.stats.innerHTML = `CPU <b>${fmt(p.last.drawMs)}</b> ms · p95 5 s <b>${fmt(p.last.drawP95Ms)}</b> ms${gpu} · ${p.last.visiblePoints.toLocaleString("en-US")} pts`;
    }
  }, 250);
}

async function main(): Promise<void> {
  const support = await isSupported();
  if (!support.ok) {
    gpuReason = support.reason ?? "unknown reason";
    const banner = $("banner");
    banner.hidden = false;
    banner.textContent = `WebGPU unavailable: ${gpuReason} Showing the Canvas2D and uPlot baselines only.`;
  }
  const form = $<HTMLFormElement>("controls");
  // ?points=&series=&ingest= preselect the controls (tests and the GIF recording use this).
  const q = new URLSearchParams(location.search);
  for (const k of ["points", "series", "ingest"]) {
    const v = q.get(k);
    const sel = form.elements.namedItem(k) as HTMLSelectElement | null;
    if (v && sel && Array.from(sel.options).some((o) => o.value === v)) sel.value = v;
  }
  const read = () => {
    const f = new FormData(form);
    return [Number(f.get("points")), Number(f.get("series")), Number(f.get("ingest"))] as const;
  };
  form.addEventListener("change", () => void build(...read()));
  $("follow").addEventListener("click", () => {
    for (const p of panes) p.chart?.setViewport("follow");
  });
  startReadouts();
  await build(...read());
  document.body.dataset.ready = "true";
}

void main();
