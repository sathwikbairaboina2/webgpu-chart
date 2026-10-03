import { BUCKET_BYTES, makeParams, type DecimateParams } from "../core/decimate";
import type { Ring } from "../core/ring";
import type { Viewport } from "../core/viewport";
import decimateWgsl from "./decimate.wgsl?raw";
import { VIEW_BYTES, packView } from "./uniforms";
import { SAMPLE_BYTES, uploadDirty } from "./upload";

export const WORKGROUP_SIZE = 64;

/** GPU resources of one series: ring storage, View uniform, bucket output. */
export interface GpuSeries {
  ring: Ring;
  ringBuffer: GPUBuffer;
  viewBuffer: GPUBuffer;
  bucketBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  width: number;
}

/** Compute pipeline for decimate.wgsl. Shared by the renderer and the GPU parity test page. */
export class GpuDecimator {
  readonly pipeline: GPUComputePipeline;
  private readonly viewScratch = new ArrayBuffer(VIEW_BYTES);

  constructor(private readonly device: GPUDevice) {
    const module = device.createShaderModule({ label: "decimate.wgsl", code: decimateWgsl });
    this.pipeline = device.createComputePipeline({ label: "decimate", layout: "auto", compute: { module, entryPoint: "main" } });
  }

  createSeries(ring: Ring, width: number): GpuSeries {
    const ringBuffer = this.device.createBuffer({
      label: "ring",
      size: ring.capacity * SAMPLE_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const viewBuffer = this.device.createBuffer({
      label: "view",
      size: VIEW_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // A fresh GPU ring buffer is zeroed; the CPU ring may already hold data, so upload all of it once.
    this.device.queue.writeBuffer(ringBuffer, 0, ring.data);
    ring.takeDirty();
    const s: GpuSeries = { ring, ringBuffer, viewBuffer, bucketBuffer: null as unknown as GPUBuffer, bindGroup: null as unknown as GPUBindGroup, width: 0 };
    this.resize(s, width);
    return s;
  }

  /** (Re)creates the bucket buffer for a new column count. */
  resize(s: GpuSeries, width: number): void {
    if (s.width === width) return;
    s.bucketBuffer?.destroy();
    s.bucketBuffer = this.device.createBuffer({
      label: "buckets",
      size: width * BUCKET_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    s.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: s.viewBuffer } },
        { binding: 1, resource: { buffer: s.ringBuffer } },
        { binding: 2, resource: { buffer: s.bucketBuffer } },
      ],
    });
    s.width = width;
  }

  /** Uploads dirty samples and the View uniform. Returns bytes of sample data uploaded and the params used. */
  prepare(s: GpuSeries, view: Viewport): { uploadBytes: number; params: DecimateParams } {
    const uploadBytes = uploadDirty(this.device.queue, s.ringBuffer, s.ring);
    const params = makeParams(s.ring, view, s.width);
    this.device.queue.writeBuffer(s.viewBuffer, 0, packView(params, s.ring.oldest, s.ring.capacity, this.viewScratch));
    return { uploadBytes, params };
  }

  /** Records the dispatch for one series into an open compute pass. */
  encode(pass: GPUComputePassEncoder, s: GpuSeries): void {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, s.bindGroup);
    pass.dispatchWorkgroups(Math.ceil(s.width / WORKGROUP_SIZE));
  }

  /** Test-only readback of the bucket buffer. Never call this in a render loop. */
  async readBuckets(s: GpuSeries): Promise<ArrayBuffer> {
    const size = s.width * BUCKET_BYTES;
    const staging = this.device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(s.bucketBuffer, 0, staging, 0, size);
    this.device.queue.submit([enc.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const out = staging.getMappedRange().slice(0);
    staging.unmap();
    staging.destroy();
    return out;
  }

  destroySeries(s: GpuSeries): void {
    s.ringBuffer.destroy();
    s.viewBuffer.destroy();
    s.bucketBuffer.destroy();
  }
}
