import type { Ring } from "../core/ring";
import type { Backend, FrameInput, RenderStats } from "../chart/backend";
import type { AcquiredDevice } from "./device";
import { GpuDecimator, type GpuSeries } from "./decimator";
import segmentsWgsl from "./segments.wgsl?raw";
import { GpuTimer } from "./timer";
import { DRAW_BYTES, packDraw, parseColor, type Rgba } from "./uniforms";

interface SeriesState {
  gpu: GpuSeries;
  color: Rgba;
  drawBuffer: GPUBuffer;
  renderBindGroup: GPUBindGroup | null;
}

export interface WebGpuBackendOptions {
  /** Background color, "#rrggbb". */
  background: string;
  /** Measure the compute pass with timestamp queries when the device has them. */
  gpuTiming?: boolean;
  /** Called once if the device is lost for a reason other than destroy(). */
  onDeviceLost?: (message: string) => void;
}

/** Renders series with GPU decimation (decimate.wgsl) and thick-segment drawing (segments.wgsl). */
export class WebGpuBackend implements Backend {
  readonly kind = "webgpu" as const;
  readonly drawsOwnAxes = false;
  private readonly series: SeriesState[] = [];
  private readonly decimator: GpuDecimator;
  private readonly renderPipeline: GPURenderPipeline;
  private readonly timer: GpuTimer | null;
  private readonly clear: GPUColor;
  private readonly drawScratch = new ArrayBuffer(DRAW_BYTES);
  private width = 1;
  private height = 1;
  private destroyed = false;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: GPUCanvasContext,
    private readonly device: GPUDevice,
    format: GPUTextureFormat,
    timestamps: boolean,
    opts: WebGpuBackendOptions,
  ) {
    this.decimator = new GpuDecimator(device);
    const module = device.createShaderModule({ label: "segments.wgsl", code: segmentsWgsl });
    this.renderPipeline = device.createRenderPipeline({
      label: "segments",
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });
    this.timer = opts.gpuTiming && timestamps ? new GpuTimer(device) : null;
    const [r, g, b] = parseColor(opts.background);
    this.clear = { r, g, b, a: 1 };
    void device.lost.then((info) => {
      if (!this.destroyed && info.reason !== "destroyed") opts.onDeviceLost?.(info.message || "GPU device lost");
    });
  }

  static create(host: HTMLElement, acquired: AcquiredDevice, opts: WebGpuBackendOptions): WebGpuBackend {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%";
    host.appendChild(canvas);
    const ctx = canvas.getContext("webgpu");
    if (!ctx) {
      canvas.remove();
      throw new Error("canvas.getContext('webgpu') returned null");
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device: acquired.device, format, alphaMode: "opaque" });
    return new WebGpuBackend(canvas, ctx, acquired.device, format, acquired.timestamps, opts);
  }

  addSeries(ring: Ring, color: string): void {
    const gpu = this.decimator.createSeries(ring, this.width);
    const drawBuffer = this.device.createBuffer({
      label: "draw",
      size: DRAW_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const s: SeriesState = { gpu, color: parseColor(color), drawBuffer, renderBindGroup: null };
    this.bindRender(s);
    this.series.push(s);
  }

  resize(widthPx: number, heightPx: number): void {
    this.width = Math.max(1, Math.round(widthPx));
    this.height = Math.max(1, Math.round(heightPx));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    for (const s of this.series) {
      this.decimator.resize(s.gpu, this.width);
      this.bindRender(s);
    }
  }

  render(f: FrameInput): RenderStats {
    let uploadBytes = 0;
    let visiblePoints = 0;
    for (const s of this.series) {
      const r = this.decimator.prepare(s.gpu, f.view);
      uploadBytes += r.uploadBytes;
      visiblePoints += r.params.end - r.params.start;
      packDraw(
        {
          widthPx: this.width,
          heightPx: this.height,
          yMin: f.yRange[0],
          yMax: f.yRange[1],
          lineWidthPx: f.lineWidthPx,
          maxGapPx: f.maxGapPx,
          color: s.color,
        },
        this.drawScratch,
      );
      this.device.queue.writeBuffer(s.drawBuffer, 0, this.drawScratch);
    }
    const enc = this.device.createCommandEncoder();
    const cp = enc.beginComputePass(this.timer ? { timestampWrites: this.timer.timestampWrites } : {});
    for (const s of this.series) this.decimator.encode(cp, s.gpu);
    cp.end();
    this.timer?.resolve(enc);
    const rp = enc.beginRenderPass({
      colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), clearValue: this.clear, loadOp: "clear", storeOp: "store" }],
    });
    rp.setPipeline(this.renderPipeline);
    for (const s of this.series) {
      rp.setBindGroup(0, s.renderBindGroup);
      rp.draw(6, 2 * this.width);
    }
    rp.end();
    this.device.queue.submit([enc.finish()]);
    this.timer?.collect();
    return { uploadBytes, visiblePoints, gpuMs: this.timer?.take() ?? null };
  }

  /** Test hook: bucket records of series `index` from the last frame. Slow; never call in a render loop. */
  readBuckets(index: number): Promise<ArrayBuffer> {
    return this.decimator.readBuckets(this.series[index].gpu);
  }

  destroy(): void {
    this.destroyed = true;
    for (const s of this.series) {
      this.decimator.destroySeries(s.gpu);
      s.drawBuffer.destroy();
    }
    this.timer?.destroy();
    this.ctx.unconfigure();
    this.canvas.remove();
  }

  private bindRender(s: SeriesState): void {
    s.renderBindGroup = this.device.createBindGroup({
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: s.drawBuffer } },
        { binding: 1, resource: { buffer: s.gpu.bucketBuffer } },
      ],
    });
  }
}
