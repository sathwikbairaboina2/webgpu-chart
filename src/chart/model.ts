import { validateBatch, type IngestReport, type OrderPolicy } from "../core/ingest";
import { Ring } from "../core/ring";
import { followView, panBy, pxToTime, zoomAt, type Bounds, type Viewport } from "../core/viewport";

export const MAX_SERIES = 8;
export const DEFAULT_COLORS = ["#4dabf7", "#ff922b", "#51cf66", "#f06595", "#fcc419", "#845ef7", "#22b8cf", "#adb5bd"];

export interface ModelOptions {
  capacity: number;
  windowMs: number;
  orderPolicy: OrderPolicy;
}

export interface SeriesEntry {
  id: string;
  color: string;
  ring: Ring;
}

export type AppendListener = (index: number, t: Float64Array, y: Float32Array) => void;

/** Renderer-independent chart state: series rings, viewport, y range. No DOM. */
export class ChartModel {
  readonly series: SeriesEntry[] = [];
  /** Follow-mode window length in ms. */
  windowMs: number;
  private view: Viewport | "follow" = "follow";
  private yRange: [number, number] | "auto" = "auto";
  private readonly listeners = new Set<AppendListener>();

  constructor(readonly opts: ModelOptions) {
    this.windowMs = opts.windowMs;
  }

  onAppend(fn: AppendListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  addSeries(id: string, color?: string): SeriesEntry {
    if (this.series.some((s) => s.id === id)) throw new Error(`series "${id}" already exists`);
    if (this.series.length >= MAX_SERIES) throw new Error(`at most ${MAX_SERIES} series are supported`);
    const entry = { id, color: color ?? DEFAULT_COLORS[this.series.length], ring: new Ring(this.opts.capacity) };
    this.series.push(entry);
    return entry;
  }

  append(id: string, t: ArrayLike<number>, y: ArrayLike<number>): IngestReport {
    const index = this.series.findIndex((s) => s.id === id);
    if (index < 0) throw new Error(`unknown series "${id}"`);
    const ring = this.series[index].ring;
    const v = validateBatch(t, y, ring.lastT(), this.opts.orderPolicy);
    if (v.t.length > 0) {
      ring.append(v.t, v.y);
      for (const fn of this.listeners) fn(index, v.t, v.y);
    }
    return v.report;
  }

  get following(): boolean {
    return this.view === "follow";
  }

  setViewport(v: Viewport | "follow"): void {
    this.view = v === "follow" ? "follow" : { t0: v.t0, t1: v.t1 };
  }

  setYRange(r: [number, number] | "auto"): void {
    this.yRange = r === "auto" ? "auto" : [r[0], r[1]];
  }

  /** Time range covered by any series. {0, 1} when there is no data. */
  bounds(): Bounds {
    let min = Infinity;
    let max = -Infinity;
    for (const s of this.series) {
      min = Math.min(min, s.ring.firstT());
      max = Math.max(max, s.ring.lastT());
    }
    return min <= max ? { min, max } : { min: 0, max: 1 };
  }

  latest(): number {
    return this.bounds().max;
  }

  resolveView(): Viewport {
    if (this.view === "follow") return followView(this.latest(), this.windowMs);
    return this.view;
  }

  resolveY(): [number, number] {
    if (this.yRange !== "auto") return this.yRange;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of this.series) {
      lo = Math.min(lo, s.ring.yMin);
      hi = Math.max(hi, s.ring.yMax);
    }
    if (lo > hi) return [0, 1];
    if (lo === hi) return [lo - 1, hi + 1];
    const pad = (hi - lo) * 0.05;
    return [lo - pad, hi + pad];
  }

  /** Zooms around the time under pixel `px` of a plot `widthPx` wide. factor > 1 zooms out. Leaves follow mode. */
  zoomAtPx(px: number, widthPx: number, factor: number): void {
    const v = this.resolveView();
    this.view = zoomAt(v, pxToTime(px, widthPx, v), factor, this.bounds());
  }

  /** Drag by `dxPx` pixels: dragging right shows earlier data. Leaves follow mode. */
  panPx(dxPx: number, widthPx: number): void {
    const v = this.resolveView();
    this.view = panBy(v, (-dxPx / widthPx) * (v.t1 - v.t0), this.bounds());
  }
}
