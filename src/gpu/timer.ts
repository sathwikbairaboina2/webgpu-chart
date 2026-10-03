/**
 * Optional GPU pass timing with timestamp queries. Reads results asynchronously and skips a frame when the
 * previous readback is still pending, so it never blocks the render loop.
 */
export class GpuTimer {
  private fresh: number | null = null;
  private readonly querySet: GPUQuerySet;
  private readonly resolveBuffer: GPUBuffer;
  private readonly readBuffer: GPUBuffer;
  private pending = false;
  private copied = false;

  constructor(device: GPUDevice) {
    this.querySet = device.createQuerySet({ type: "timestamp", count: 2 });
    this.resolveBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    this.readBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  }

  /** Pass this into beginComputePass. */
  get timestampWrites(): GPUComputePassTimestampWrites {
    return { querySet: this.querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 };
  }

  /** Call after the timed pass ends, before finish(). */
  resolve(enc: GPUCommandEncoder): void {
    this.copied = false;
    if (this.pending) return;
    enc.resolveQuerySet(this.querySet, 0, 2, this.resolveBuffer, 0);
    enc.copyBufferToBuffer(this.resolveBuffer, 0, this.readBuffer, 0, 16);
    this.copied = true;
  }

  /** Call after queue.submit(). */
  collect(): void {
    if (!this.copied) return;
    this.pending = true;
    this.readBuffer
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        const t = new BigUint64Array(this.readBuffer.getMappedRange());
        const ns = Number(t[1] - t[0]);
        this.readBuffer.unmap();
        if (ns >= 0) this.fresh = ns / 1e6;
      })
      // destroy() while a map is pending rejects with AbortError; nothing to report.
      .catch(() => undefined)
      .finally(() => {
        this.pending = false;
      });
  }

  /** The newest pass time in ms, once; null when no new reading arrived since the last call. */
  take(): number | null {
    const v = this.fresh;
    this.fresh = null;
    return v;
  }

  destroy(): void {
    this.querySet.destroy();
    this.resolveBuffer.destroy();
    this.readBuffer.destroy();
  }
}
