import type { Ring } from "../core/ring";
import type { Viewport } from "../core/viewport";

export type BackendKind = "webgpu" | "canvas2d" | "uplot";

export interface FrameInput {
  view: Viewport;
  yRange: [number, number];
  /** Device pixels. */
  lineWidthPx: number;
  maxGapPx: number;
}

export interface RenderStats {
  uploadBytes: number;
  visiblePoints: number;
  /** GPU decimation pass time from timestamp queries, when enabled and available. */
  gpuMs: number | null;
}

/** A renderer the Chart drives. WebGPU, Canvas2D and uPlot implement it. */
export interface Backend {
  readonly kind: BackendKind;
  /** True when the backend draws its own axes (uPlot); the chart then skips its overlay and margins. */
  readonly drawsOwnAxes: boolean;
  addSeries(ring: Ring, color: string): void;
  /** Validated samples just appended to series `index`. Only backends that keep their own copy need it. */
  onAppend?(index: number, t: Float64Array, y: Float32Array): void;
  /** Plot size in device pixels. */
  resize(widthPx: number, heightPx: number): void;
  render(frame: FrameInput): RenderStats;
  destroy(): void;
}

/** Emitted after every frame. */
export interface FrameStats {
  kind: BackendKind;
  /** Time since the previous frame (rAF delta). 0 on the first frame. */
  frameMs: number;
  /** CPU time spent inside Backend.render this frame. */
  drawMs: number;
  /** p95 of drawMs over the last 5 seconds. */
  drawP95Ms: number;
  gpuMs: number | null;
  visiblePoints: number;
  uploadBytes: number;
}
