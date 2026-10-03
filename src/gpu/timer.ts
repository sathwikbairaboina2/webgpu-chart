/**
 * Optional GPU pass timing with timestamp queries. A ring of query slots and readback buffers lets a new frame
 * be timed while earlier readbacks are still pending, so every frame is timed unless all slots are busy. Reads
 * are asynchronous and never block the render loop.
 */
export class GpuTimer {
  private fresh: number | null = null;
  private readonly querySet: GPUQuerySet;
  private readonly resolveBuffer: GPUBuffer;
  private readonly readBuffers: GPUBuffer[] = [];
  private readonly busy: boolean[];
  private readonly inFlight = new Set<Promise<void>>();
  private samples: number[] = [];
  private next = 0;
  /** Slot used by the frame being encoded, or -1 when this frame is not timed. */
  private current = -1;

  constructor(
    device: GPUDevice,
    private readonly slots = 8,
  ) {
    this.querySet = device.createQuerySet({ type: "timestamp", count: 2 * slots });
    this.resolveBuffer = device.createBuffer({ size: 16 * slots, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    for (let i = 0; i < slots; i++) {
      this.readBuffers.push(device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }));
    }
    this.busy = new Array<boolean>(slots).fill(false);
  }

  /** Call once per frame before the timed pass. Returns what to pass into beginComputePass, or undefined when every slot is busy. */
  begin(): GPUComputePassTimestampWrites | undefined {
    this.current = -1;
    for (let k = 0; k < this.slots; k++) {
      const slot = (this.next + k) % this.slots;
      if (!this.busy[slot]) {
        this.current = slot;
        this.next = (slot + 1) % this.slots;
        return { querySet: this.querySet, beginningOfPassWriteIndex: 2 * slot, endOfPassWriteIndex: 2 * slot + 1 };
      }
    }
    return undefined;
  }

  /** Call after the timed pass ends, before finish(). */
  resolve(enc: GPUCommandEncoder): void {
    const k = this.current;
    if (k < 0) return;
    enc.resolveQuerySet(this.querySet, 2 * k, 2, this.resolveBuffer, 16 * k);
    enc.copyBufferToBuffer(this.resolveBuffer, 16 * k, this.readBuffers[k], 0, 16);
  }

  /** Call after queue.submit(). */
  collect(): void {
    const k = this.current;
    if (k < 0) return;
    this.current = -1;
    this.busy[k] = true;
    const buf = this.readBuffers[k];
    const p: Promise<void> = buf
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        const t = new BigUint64Array(buf.getMappedRange());
        const ns = Number(t[1] - t[0]);
        buf.unmap();
        if (ns >= 0) {
          this.fresh = ns / 1e6;
          this.samples.push(ns / 1e6);
        }
      })
      // destroy() while a map is pending rejects with AbortError; nothing to report.
      .catch(() => undefined)
      .finally(() => {
        this.busy[k] = false;
        this.inFlight.delete(p);
      });
    this.inFlight.add(p);
  }

  /** The newest pass time in ms, once; null when no new reading arrived since the last call. */
  take(): number | null {
    const v = this.fresh;
    this.fresh = null;
    return v;
  }

  /** Waits for pending readbacks and returns every reading since the last drain, oldest first. */
  async drain(): Promise<number[]> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
    const out = this.samples;
    this.samples = [];
    return out;
  }

  destroy(): void {
    this.querySet.destroy();
    this.resolveBuffer.destroy();
    for (const b of this.readBuffers) b.destroy();
  }
}
