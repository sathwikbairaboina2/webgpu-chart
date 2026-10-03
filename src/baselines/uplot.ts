import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { Ring } from "../core/ring";
import type { Backend, FrameInput, RenderStats } from "../chart/backend";
import type { Theme } from "../chart/theme";
import { LinearWindow } from "./linearWindow";

/**
 * uPlot baseline. uPlot needs aligned, contiguous arrays, so appended samples go into a LinearWindow
 * (amortized O(new), no full copy per frame). All series must receive the same timestamps in the same batches,
 * which is true for the bench and the demo. uPlot does its own decimation and draws its own axes.
 */
export class UPlotBackend implements Backend {
  readonly kind = "uplot" as const;
  readonly drawsOwnAxes = true;
  private readonly colors: string[] = [];
  private readonly pending: { t: number[]; y: number[] }[] = [];
  private window: LinearWindow | null = null;
  private plot: uPlot | null = null;
  private capacity = 1;
  private widthCss = 1;
  private heightCss = 1;
  private dirty = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly theme: Theme,
  ) {}

  static create(host: HTMLElement, theme: Theme): UPlotBackend {
    return new UPlotBackend(host, theme);
  }

  addSeries(ring: Ring, color: string): void {
    if (this.plot) throw new Error("uPlot baseline: add every series before the first frame");
    this.capacity = Math.max(this.capacity, ring.capacity);
    this.colors.push(color);
    this.pending.push({ t: [], y: [] });
  }

  onAppend(index: number, t: Float64Array, y: Float32Array): void {
    const p = this.pending[index];
    for (let i = 0; i < t.length; i++) {
      p.t.push(t[i] / 1000);
      p.y.push(y[i]);
    }
  }

  resize(widthPx: number, heightPx: number): void {
    const dpr = globalThis.devicePixelRatio || 1;
    this.widthCss = Math.max(1, Math.round(widthPx / dpr));
    this.heightCss = Math.max(1, Math.round(heightPx / dpr));
    this.plot?.setSize({ width: this.widthCss, height: this.heightCss });
  }

  render(f: FrameInput): RenderStats {
    this.commitPending();
    const plot = this.ensurePlot(f);
    const v = this.window!.view();
    plot.batch(() => {
      if (this.dirty) {
        plot.setData([v.x, ...v.y], false);
        this.dirty = false;
      }
      plot.setScale("x", { min: f.view.t0 / 1000, max: f.view.t1 / 1000 });
      plot.setScale("y", { min: f.yRange[0], max: f.yRange[1] });
    });
    let visible = 0;
    const lo = lowerBound(v.x, f.view.t0 / 1000);
    const hi = lowerBound(v.x, f.view.t1 / 1000, true);
    visible = (hi - lo) * v.y.length;
    return { uploadBytes: 0, visiblePoints: visible, gpuMs: null };
  }

  /** uPlot commits in a microtask after setScale; wait for it, then read a pixel back to force the flush. */
  async settled(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    this.plot?.ctx.getImageData(0, 0, 1, 1);
  }

  destroy(): void {
    this.plot?.destroy();
    this.plot = null;
  }

  /** Moves samples that every series has received into the window. */
  private commitPending(): void {
    if (this.pending.length === 0) return;
    const k = Math.min(...this.pending.map((p) => p.t.length));
    if (k === 0) return;
    this.window ??= new LinearWindow(this.capacity, this.pending.length);
    const x = this.pending[0].t.slice(0, k);
    const ys = this.pending.map((p) => p.y.slice(0, k));
    this.window.append(x, ys);
    for (const p of this.pending) {
      p.t.splice(0, k);
      p.y.splice(0, k);
    }
    this.dirty = true;
  }

  private ensurePlot(f: FrameInput): uPlot {
    this.window ??= new LinearWindow(this.capacity, Math.max(1, this.pending.length));
    if (this.plot) return this.plot;
    const axis = { stroke: this.theme.axisText, grid: { stroke: this.theme.grid, width: 1 }, ticks: { stroke: this.theme.grid }, font: this.theme.font };
    const opts: uPlot.Options = {
      width: this.widthCss,
      height: this.heightCss,
      pxAlign: 0,
      cursor: { show: false },
      legend: { show: false },
      scales: { x: { time: true, auto: false }, y: { auto: false } },
      axes: [axis, axis],
      series: [{}, ...this.colors.map((c) => ({ stroke: c, width: f.lineWidthPx / (globalThis.devicePixelRatio || 1), points: { show: false } }))],
    };
    const v = this.window.view();
    this.host.style.background = this.theme.background;
    this.plot = new uPlot(opts, [v.x, ...v.y], this.host);
    this.dirty = false;
    return this.plot;
  }
}

function lowerBound(a: Float64Array, x: number, after = false): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (after ? a[mid] <= x : a[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
