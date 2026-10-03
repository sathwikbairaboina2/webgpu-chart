/**
 * Sliding window of aligned columns (x plus one y per series) for uPlot, which needs contiguous sorted arrays.
 * Backing arrays are 2 x capacity long; appends write at the end and compact with copyWithin only when the end is
 * reached, so the amortized cost per append is O(new samples), and view() returns subarrays without copying.
 */
export class LinearWindow {
  private readonly xs: Float64Array;
  private readonly ys: Float32Array[];
  private start = 0;
  count = 0;

  constructor(
    readonly capacity: number,
    readonly seriesCount: number,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
    this.xs = new Float64Array(2 * capacity);
    this.ys = Array.from({ length: seriesCount }, () => new Float32Array(2 * capacity));
  }

  append(x: ArrayLike<number>, ys: ArrayLike<number>[]): void {
    if (ys.length !== this.seriesCount) throw new RangeError(`expected ${this.seriesCount} y columns, got ${ys.length}`);
    for (const y of ys) if (y.length !== x.length) throw new RangeError("x and y lengths differ");
    let from = 0;
    let k = x.length;
    if (k > this.capacity) {
      from = k - this.capacity;
      k = this.capacity;
    }
    if (this.start + this.count + k > this.xs.length) {
      const keep = Math.min(this.count, this.capacity - k);
      const src = this.start + this.count - keep;
      this.xs.copyWithin(0, src, src + keep);
      for (const col of this.ys) col.copyWithin(0, src, src + keep);
      this.start = 0;
      this.count = keep;
    }
    const at = this.start + this.count;
    for (let i = 0; i < k; i++) this.xs[at + i] = x[from + i];
    for (let s = 0; s < this.seriesCount; s++) {
      const col = this.ys[s];
      const y = ys[s];
      for (let i = 0; i < k; i++) col[at + i] = y[from + i];
    }
    this.count += k;
    if (this.count > this.capacity) {
      this.start += this.count - this.capacity;
      this.count = this.capacity;
    }
  }

  view(): { x: Float64Array; y: Float32Array[] } {
    const a = this.start;
    const b = this.start + this.count;
    return { x: this.xs.subarray(a, b), y: this.ys.map((c) => c.subarray(a, b)) };
  }
}
