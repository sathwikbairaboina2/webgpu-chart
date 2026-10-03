import type { OrderPolicy } from "../core/ingest";
import type { Ring } from "../core/ring";
import { RollingWindow } from "../core/stats";
import type { Viewport } from "../core/viewport";
import { MARGINS, axesKey, drawAxes, layoutAxes, type PlotRect } from "./axes";
import type { Backend, FrameStats } from "./backend";
import { attachInput } from "./input";
import { ChartModel } from "./model";
import { THEMES, type Theme } from "./theme";

export interface ChartOptions {
  /** Samples kept per series. Default 1,000,000. */
  capacity?: number;
  theme?: "dark" | "light";
  /** CSS px. Default 1. */
  lineWidthPx?: number;
  /** Columns a connector may bridge. Default 32. */
  maxGapPx?: number;
  /** Follow-mode window. Default 10,000 ms. */
  windowMs?: number;
  orderPolicy?: OrderPolicy;
  /** Start the rAF loop on create. Default true. */
  autoStart?: boolean;
  /** Drag, wheel and double-click handling. Default true. */
  interactive?: boolean;
  /** Axis labels in UTC instead of local time. Default false. */
  utcLabels?: boolean;
  /** Record GPU pass times with timestamp queries when available. Default false. */
  gpuTiming?: boolean;
}

export type BackendFactory = (plotHost: HTMLElement, theme: Theme) => Backend | Promise<Backend>;

const DEFAULTS: Required<ChartOptions> = {
  capacity: 1_000_000,
  theme: "dark",
  lineWidthPx: 1,
  maxGapPx: 32,
  windowMs: 10_000,
  orderPolicy: "drop",
  autoStart: true,
  interactive: true,
  utcLabels: false,
  gpuTiming: false,
};

/** A chart pane: a plot backend, an axis overlay, input handling and a render loop around a ChartModel. */
export class Chart {
  readonly model: ChartModel;
  readonly root: HTMLDivElement;
  readonly options: Required<ChartOptions>;
  readonly theme: Theme;
  private readonly plotHost: HTMLDivElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly overlayCtx: CanvasRenderingContext2D;
  private backend!: Backend;
  private plot: PlotRect = { left: 0, top: 0, width: 1, height: 1 };
  private size = { width: 1, height: 1 };
  private dpr = 1;
  private lastAxes = "";
  private lastFrame = 0;
  private readonly drawTimes = new RollingWindow(5_000);
  private running = false;
  private rafId = 0;
  private readonly frameFns = new Set<(s: FrameStats) => void>();
  private readonly errorFns = new Set<(e: Error) => void>();
  private detachInput: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private constructor(container: HTMLElement, options: ChartOptions) {
    this.options = { ...DEFAULTS, ...options };
    this.theme = THEMES[this.options.theme];
    this.model = new ChartModel({ capacity: this.options.capacity, windowMs: this.options.windowMs, orderPolicy: this.options.orderPolicy });
    this.root = document.createElement("div");
    this.root.className = "gtc-root";
    this.root.style.cssText = `position:relative;width:100%;height:100%;overflow:hidden;touch-action:none;background:${this.theme.background}`;
    this.plotHost = document.createElement("div");
    this.plotHost.style.cssText = "position:absolute";
    this.overlay = document.createElement("canvas");
    this.overlay.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none";
    this.root.append(this.plotHost, this.overlay);
    container.appendChild(this.root);
    const ctx = this.overlay.getContext("2d");
    if (!ctx) throw new Error("Canvas2D context is unavailable for the axis overlay");
    this.overlayCtx = ctx;
  }

  static async create(container: HTMLElement, factory: BackendFactory, options: ChartOptions = {}): Promise<Chart> {
    const chart = new Chart(container, options);
    try {
      chart.backend = await factory(chart.plotHost, chart.theme);
    } catch (e) {
      chart.root.remove();
      throw e;
    }
    chart.model.onAppend((i, t, y) => chart.backend.onAppend?.(i, t, y));
    chart.layout();
    if (chart.options.interactive) chart.detachInput = attachInput(chart.root, chart.model, () => chart.plot);
    if (typeof ResizeObserver !== "undefined") {
      chart.resizeObserver = new ResizeObserver(() => chart.layout());
      chart.resizeObserver.observe(chart.root);
    }
    if (chart.options.autoStart) chart.start();
    return chart;
  }

  get kind(): Backend["kind"] {
    return this.backend.kind;
  }

  addSeries(id: string, color?: string): Ring {
    const s = this.model.addSeries(id, color);
    this.backend.addSeries(s.ring, s.color);
    return s.ring;
  }

  setViewport(v: Viewport | "follow"): void {
    this.model.setViewport(v);
  }

  setYRange(r: [number, number] | "auto"): void {
    this.model.setYRange(r);
  }

  /** Measures the root and resizes the plot backend and overlay. Called on create and on resize. */
  layout(): void {
    const r = this.root.getBoundingClientRect();
    this.size = { width: Math.max(1, r.width), height: Math.max(1, r.height) };
    this.dpr = globalThis.devicePixelRatio || 1;
    const m = this.backend.drawsOwnAxes ? { left: 0, right: 0, top: 0, bottom: 0 } : MARGINS;
    this.plot = {
      left: m.left,
      top: m.top,
      width: Math.max(1, this.size.width - m.left - m.right),
      height: Math.max(1, this.size.height - m.top - m.bottom),
    };
    Object.assign(this.plotHost.style, {
      left: `${this.plot.left}px`,
      top: `${this.plot.top}px`,
      width: `${this.plot.width}px`,
      height: `${this.plot.height}px`,
    });
    this.overlay.width = Math.round(this.size.width * this.dpr);
    this.overlay.height = Math.round(this.size.height * this.dpr);
    this.backend.resize(Math.round(this.plot.width * this.dpr), Math.round(this.plot.height * this.dpr));
    this.lastAxes = "";
  }

  /** Renders one frame. The rAF loop calls it; the bench calls it directly. */
  frame(now: number = performance.now()): FrameStats {
    const frameMs = this.lastFrame ? now - this.lastFrame : 0;
    this.lastFrame = now;
    const view = this.model.resolveView();
    const yRange = this.model.resolveY();
    const t = performance.now();
    const r = this.backend.render({ view, yRange, lineWidthPx: this.options.lineWidthPx * this.dpr, maxGapPx: this.options.maxGapPx });
    const drawMs = performance.now() - t;
    this.drawTimes.push(now, drawMs);
    if (!this.backend.drawsOwnAxes) this.drawOverlay(view, yRange);
    const stats: FrameStats = {
      kind: this.backend.kind,
      frameMs,
      drawMs,
      drawP95Ms: this.drawTimes.percentile(95),
      gpuMs: r.gpuMs,
      visiblePoints: r.visiblePoints,
      uploadBytes: r.uploadBytes,
    };
    for (const fn of this.frameFns) fn(stats);
    return stats;
  }

  /** Resolves when the backend has finished executing the frames rendered so far. Resolves at once if it cannot tell. */
  settled(): Promise<void> {
    return this.backend.settled?.() ?? Promise.resolve();
  }

  /** GPU pass times recorded since the last call; empty unless the backend times its passes. */
  drainGpuMs(): Promise<number[]> {
    return this.backend.drainGpuMs?.() ?? Promise.resolve([]);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = (t: number) => {
      if (!this.running) return;
      try {
        this.frame(t);
      } catch (e) {
        this.stop();
        this.emitError(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.lastFrame = 0;
  }

  get isRunning(): boolean {
    return this.running;
  }

  on(event: "frame", fn: (s: FrameStats) => void): () => void;
  on(event: "error", fn: (e: Error) => void): () => void;
  on(event: "frame" | "error", fn: ((s: FrameStats) => void) | ((e: Error) => void)): () => void {
    const set = (event === "frame" ? this.frameFns : this.errorFns) as Set<typeof fn>;
    set.add(fn);
    return () => set.delete(fn);
  }

  emitError(e: Error): void {
    for (const fn of this.errorFns) fn(e);
  }

  destroy(): void {
    this.stop();
    this.detachInput?.();
    this.resizeObserver?.disconnect();
    this.backend.destroy();
    this.root.remove();
    this.frameFns.clear();
    this.errorFns.clear();
  }

  private drawOverlay(view: Viewport, yRange: [number, number]): void {
    const tz = this.options.utcLabels ? 0 : -new Date(view.t1).getTimezoneOffset() * 60_000;
    const l = layoutAxes(view, yRange, this.plot, { tzOffsetMs: tz, utc: this.options.utcLabels });
    const key = axesKey(l);
    if (key === this.lastAxes) return;
    this.lastAxes = key;
    drawAxes(this.overlayCtx, l, this.plot, this.size, this.theme, this.dpr);
  }
}
