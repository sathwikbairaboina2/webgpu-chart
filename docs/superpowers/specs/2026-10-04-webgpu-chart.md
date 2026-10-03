# webgpu-chart v0.1 spec

Date: 2026-10-04. Author: Claude (Opus lead). Status: accepted for build.
Design source: `C:\Users\sathwik\projects\taskarinchu\docs\devdocs\webgpu-chart.md` (the "design doc").
Portfolio bar: `C:\Users\sathwik\projects\taskarinchu\docs\superpowers\specs\2026-10-03-project-shortlist.md`.

## 1. What we ship

A streaming time-series chart that draws millions of points per frame with WebGPU. A compute shader reduces the
visible window to one min/max/first/last bucket per pixel column (M4-style). It ships as:

1. **A library** `@sathwik/gpu-timeseries` (ESM + `.d.ts`, zero runtime dependencies), packable with `pnpm pack`
   and installable into a fresh project. This is the "something others install" item.
2. **A demo page** with three stacked panes on the same data: WebGPU, Canvas2D (same CPU decimation), and uPlot.
   Each pane shows a live frame-time readout and p95 over the last 5 s. Pan, zoom, follow mode, a point-count picker.
3. **A bench harness** that runs the same seeded dataset and the same scripted interaction through all three
   renderers in host Chrome and writes JSON. The README headline and table are generated from that JSON.
4. **A GIF** of the demo at the top of the README (recorded with Playwright + ffmpeg). There is no hosted live URL
   in v0.1: we have no deploy account and must not push. The Docker image serves the demo locally.

## 2. Portfolio bar mapping

| Bar item | How v0.1 meets it |
|---|---|
| 30-second wow | `docs/demo.gif`: three panes, WebGPU readout green, baselines struggling at 4 x 1M points |
| Headline number | README line 1 from `bench/results/latest.json`: "4 series x 1M points: p95 frame X ms on WebGPU vs Y ms on uPlot and Z ms on Canvas2D (HARDWARE)" |
| Something installable | `pnpm pack` tarball; `pnpm pack:smoke` installs it into a temp project and imports it |
| Honest ADRs | `docs/adr/0001` to `0007`, each with "what we gave up" |
| CI with tests | `.github/workflows/ci.yml`: typecheck, unit + property tests, build, fallback e2e, pack smoke. GPU tests run on the host only (CI runners have no GPU adapter) |

## 3. Scope

In v0.1 (pulled forward from the design's v0.2 where cheap and needed for an honest headline):
- Ring buffer, visible-range search, epoch rebasing, span eviction (invariants 3, 4, 6).
- CPU reference decimation with spike preservation (invariant 2).
- GPU decimation with exact parity to the CPU reference (invariant 1), proven in host Chrome.
- WebGPU render of decimated columns, dirty-range uploads (invariant 7).
- Ingest validation policies (invariant 5).
- Canvas2D baseline and uPlot baseline, fairness hash (invariant 9).
- Pan (drag), zoom (wheel, anchored at cursor), double-click reset to follow mode, nice ticks on a Canvas2D overlay.
- Synthetic streaming source (main thread, timer-driven).
- Optional GPU pass timing via `timestamp-query` (bench only).

Deferred to v0.2 (recorded in ADRs and the README "Known limits"):
- Device-lost recovery from the CPU mirror (invariant 8). v0.1 shows a message and stops the WebGPU pane.
- WebSocket and MQTT adapters, the ingest worker, OffscreenCanvas.
- npm publish (needs an account), hosted live URL.
- Area/band modes, multi-axis, mip-pyramid decimation for 10M+.

Non-goals: as in the design doc (no general chart library, no SVG export, no WebGL fallback).

## 4. Decisions that refine the design doc

Each is backed by an ADR or a `Ruling:` line in the ledger.

1. **Bucketing contract (ADR 0002).** Column of a sample: `col = clamp(floor(f32(f32(t - t0) * scale)), 0, width - 1)`,
   where `t`, `t0` are f32 relative ms and `scale = f32(width / max(t1 - t0, 1e-3))`. The CPU reference emulates f32
   with `Math.fround` at each step. WGSL `-` and `*` are correctly rounded, so CPU and GPU agree bit for bit.
   Verified in a prototype on 2026-10-04: 40 random cases, 43,431 columns, wrapped rings, duplicate timestamps,
   0 mismatches on host Chrome 154 (NVIDIA Lovelace).
2. **GPU kernel shape (ADR 0002).** One invocation per column. It binary-searches the first sample of its column in
   the visible logical index range, then scans forward until the column changes. No atomics, no float atomics.
3. **Bucket layout.** 32 bytes per column: `minY f32, maxY f32, firstY f32, lastY f32, n u32, pad u32 x3`.
   The CPU reference writes the same layout into an `ArrayBuffer`, so parity is a byte comparison.
4. **Value canonicalization.** `Ring.append` stores `y` as f32, turns `-0` into `+0` and flushes f32 subnormals
   (`|y| < 2^-126`) to `0`. GPUs may flush subnormals and `min(-0, +0)` is unspecified; canonical input makes the
   byte comparison valid.
5. **Time (ADR 0005).** Ring stores `t` as f32 ms relative to a per-ring integer epoch. Max span is `2^24` ms
   (about 4.66 h). On append, samples older than `newest - 2^24` are evicted, then the epoch is re-based to the
   oldest sample when needed. So relative time never exceeds `2^24` (invariant 6).
6. **Y range.** Auto mode tracks min/max over every sample ever appended (O(new) per append, never shrinks), or the
   caller sets a fixed range. No per-frame readback. The bench passes the same fixed range to all renderers.
7. **Rendering.** Each non-empty column becomes one vertical segment `(c + 0.5, minY) -> (c + 0.5, maxY)`, and each
   non-empty column also gets a connector from the previous non-empty column `p` (if `c - p <= maxGapPx`, default 32)
   `(p + 0.5, lastY_p) -> (c + 0.5, firstY_c)`. Gaps wider than `maxGapPx` stay gaps. The CPU function
   `segmentsFromBuckets` defines this; `segments.wgsl` implements the same rule; Canvas2D strokes the CPU segments.
   This replaces the design's separate "raw mode below 2 points per pixel": with this rule a sparse window already
   draws as a polyline through the points (each point is alone in its column, so first = last = min = max).
8. **Measurement (ADR 0004).** Bench runs a production build in host Chrome (`channel: "chrome"`) with
   `--disable-frame-rate-limit --disable-gpu-vsync`, so rAF deltas measure work instead of the 8.3 ms vsync of the
   120 Hz panel. The script is frame-count based (identical steps for every renderer), not wall-clock based.
9. **Where GPU tests run (ADR 0003).** Playwright with `channel: "chrome"` on the Windows host. The prototype showed
   host Chrome gets an adapter even headless; bundled Chromium and container Chromium get `null`. No CDP-from-Docker.
10. **Toolchain (ADR 0006).** Host Node 24 + pnpm 9.12.0 for dev, tests and bench (the GPU is on the host). Docker
    builds and serves the static demo with nginx. Demo is vanilla TypeScript (no React), library has no runtime deps.
11. **API change.** `GpuChart.create(container: HTMLElement, options)` takes a container, not a canvas, because the
    chart owns two canvases (plot + axis overlay).
12. **Ingest on the main thread (ADR 0007)** in v0.1.

## 5. Public API (library)

```ts
export class GpuChart {
  static isSupported(): Promise<{ ok: boolean; reason?: string }>;
  static create(container: HTMLElement, options?: ChartOptions): Promise<GpuChart>;
  addSeries(options: SeriesOptions): SeriesHandle;      // max 8 series
  setViewport(v: { t0: number; t1: number } | "follow"): void;
  setYRange(range: [number, number] | "auto"): void;
  on(event: "frame", fn: (s: FrameStats) => void): () => void;
  on(event: "error", fn: (e: Error) => void): () => void;
  destroy(): void;
}
interface SeriesHandle { readonly id: string; append(t: ArrayLike<number>, y: ArrayLike<number>): IngestReport; }
```

Also exported for reuse and the pack smoke test: `decimate`, `makeParams`, `Ring`, `niceTicks`, `timeTicks`,
`validateBatch`, `segmentsFromBuckets`, and their types. Public `.d.ts` must not mention `GPU*` types.

## 6. Invariants and their tests (v0.1)

| # | Invariant | Test |
|---|---|---|
| 1 | GPU buckets are byte-identical to `core/decimate.ts` | `e2e/gpu/parity.spec.ts` (host Chrome, seeded cases incl. wrap, empty window, duplicate t) |
| 2 | A single spike in the window shows in its column's min or max | `tests/decimate.property.test.ts` |
| 3 | `count <= capacity`; overflow overwrites oldest; contents equal a naive model | `tests/ring.property.test.ts` |
| 4 | `visibleRange` returns exactly `t0 <= t <= t1`, across the wrap | `tests/ring.visibleRange.test.ts` |
| 5 | Non-finite and out-of-order samples never enter the ring | `tests/ingest.test.ts` |
| 6 | Relative t never exceeds 2^24 ms | `tests/ring.epoch.test.ts` (6-hour stream) |
| 7 | Steady-state upload bytes = new samples x 8 per series | `tests/upload.test.ts` (mock queue) |
| 9 | All renderers receive identical data and script | `tests/bench.fairness.test.ts` |

Invariant 8 (device-lost recovery) is deferred to v0.2.

## 7. Ports, names, files

- Host ports: dev 5430, preview 5431, Docker demo 5432, Playwright dev server 5433, bench preview 5434,
  demo recording preview 5435. Nothing else.
- Docker: compose project `webgpu-chart`, container `webgpu-chart-app`, image `webgpu-chart:local`.
- Bench output: `bench/results/<YYYY-MM-DD>-chrome-<gpu-slug>.json` and a copy at `bench/results/latest.json`.

## 8. Acceptance (v0.1 done)

All gates in the plan pass on the host, the README headline comes from committed bench JSON, the GIF is committed
and under 5 MB, ADRs 0001 to 0007 exist, `docs/DEVDOCS.md` and `docs/handoff.md` are written, nothing is pushed.
