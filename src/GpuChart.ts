import { Chart, type ChartOptions } from "./chart/Chart";
import type { FrameStats } from "./chart/backend";
import type { IngestReport } from "./core/ingest";
import type { Viewport } from "./core/viewport";
import { acquireDevice } from "./gpu/device";
import { isSupported, type SupportResult } from "./gpu/support";
import { WebGpuBackend } from "./gpu/WebGpuBackend";

export interface SeriesOptions {
  id: string;
  /** "#rrggbb" or "#rrggbbaa". Defaults to the next palette color. */
  color?: string;
}

export interface SeriesHandle {
  readonly id: string;
  /** Appends samples. t is Unix ms, non-decreasing; bad samples are dropped and counted (see IngestReport). */
  append(t: ArrayLike<number>, y: ArrayLike<number>): IngestReport;
}

/** Public WebGPU chart. Wraps a Chart with the WebGPU backend. */
export class GpuChart {
  private constructor(private readonly chart: Chart) {}

  static isSupported(): Promise<SupportResult> {
    return isSupported();
  }

  static async create(container: HTMLElement, options: ChartOptions = {}): Promise<GpuChart> {
    const acquired = await acquireDevice(undefined, { timestamps: options.gpuTiming });
    let chart: Chart | null = null;
    chart = await Chart.create(
      container,
      (host, theme) =>
        WebGpuBackend.create(host, acquired, {
          background: theme.background,
          gpuTiming: options.gpuTiming,
          onDeviceLost: (msg) => {
            chart?.stop();
            chart?.emitError(new Error(`GPU device lost: ${msg}`));
          },
        }),
      options,
    );
    return new GpuChart(chart);
  }

  addSeries(options: SeriesOptions): SeriesHandle {
    this.chart.addSeries(options.id, options.color);
    return { id: options.id, append: (t, y) => this.chart.model.append(options.id, t, y) };
  }

  setViewport(v: Viewport | "follow"): void {
    this.chart.setViewport(v);
  }

  setYRange(r: [number, number] | "auto"): void {
    this.chart.setYRange(r);
  }

  on(event: "frame", fn: (s: FrameStats) => void): () => void;
  on(event: "error", fn: (e: Error) => void): () => void;
  on(event: "frame" | "error", fn: ((s: FrameStats) => void) | ((e: Error) => void)): () => void {
    return event === "frame" ? this.chart.on("frame", fn as (s: FrameStats) => void) : this.chart.on("error", fn as (e: Error) => void);
  }

  start(): void {
    this.chart.start();
  }

  stop(): void {
    this.chart.stop();
  }

  destroy(): void {
    this.chart.destroy();
  }
}
