import { createBuckets, decimate, makeParams, type Buckets } from "../core/decimate";
import type { Ring } from "../core/ring";
import { segmentCapacity, segmentsInto } from "../core/segments";
import type { Backend, FrameInput, RenderStats } from "../chart/backend";

/** The part of CanvasRenderingContext2D the baseline uses. Tests pass a recorder. */
export interface Ctx2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  /** Reading a pixel back forces the browser to finish queued drawing. */
  getImageData?(sx: number, sy: number, sw: number, sh: number): unknown;
}

export interface Canvas2DLike {
  width: number;
  height: number;
  getContext(id: "2d", options?: CanvasRenderingContext2DSettings): Ctx2D | null;
}

/**
 * Canvas2D baseline: the same CPU decimation and segment rule as the WebGPU path (spec section 4.7),
 * stroked with one path per series. The only difference from WebGPU is where the work runs.
 */
export class Canvas2DBackend implements Backend {
  readonly kind = "canvas2d" as const;
  readonly drawsOwnAxes = false;
  private readonly ctx: Ctx2D;
  private readonly series: { ring: Ring; color: string }[] = [];
  private buckets: Buckets = createBuckets(1);
  private segs = new Float32Array(segmentCapacity(1));
  private width = 1;
  private height = 1;

  constructor(
    private readonly canvas: Canvas2DLike,
    private readonly background: string,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas2D context is unavailable");
    this.ctx = ctx;
  }

  static create(host: HTMLElement, background: string): Canvas2DBackend {
    const c = document.createElement("canvas");
    c.style.cssText = "display:block;width:100%;height:100%";
    host.appendChild(c);
    return new Canvas2DBackend(c, background);
  }

  addSeries(ring: Ring, color: string): void {
    this.series.push({ ring, color });
  }

  resize(widthPx: number, heightPx: number): void {
    this.width = Math.max(1, Math.round(widthPx));
    this.height = Math.max(1, Math.round(heightPx));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.buckets = createBuckets(this.width);
    this.segs = new Float32Array(segmentCapacity(this.width));
  }

  render(f: FrameInput): RenderStats {
    const ctx = this.ctx;
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.lineWidth = f.lineWidthPx;
    ctx.lineCap = "butt";
    const map = { yMin: f.yRange[0], yMax: f.yRange[1], heightPx: this.height };
    let visible = 0;
    for (const s of this.series) {
      const p = makeParams(s.ring, f.view, this.width);
      visible += p.end - p.start;
      decimate(s.ring, p, this.buckets);
      const n = segmentsInto(this.buckets, map, f.maxGapPx, this.segs);
      const g = this.segs;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        ctx.moveTo(g[4 * i], g[4 * i + 1]);
        ctx.lineTo(g[4 * i + 2], g[4 * i + 3]);
      }
      ctx.strokeStyle = s.color;
      ctx.stroke();
    }
    return { uploadBytes: 0, visiblePoints: visible, gpuMs: null };
  }

  settled(): Promise<void> {
    this.ctx.getImageData?.(0, 0, 1, 1);
    return Promise.resolve();
  }

  destroy(): void {
    const el = this.canvas as Partial<HTMLCanvasElement>;
    el.remove?.();
  }
}
