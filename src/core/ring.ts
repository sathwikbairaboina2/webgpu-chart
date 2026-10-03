/** Largest span of relative time a ring holds: 2^24 ms (about 4.66 h). f32 is exact for integers below it. */
export const MAX_SPAN_MS = 16_777_216;
/** Samples are kept while newest - t <= KEEP_MS, so that newest - floor(oldest) < MAX_SPAN_MS. */
const KEEP_MS = MAX_SPAN_MS - 1;
/** Smallest positive normal f32 (2^-126). */
const MIN_NORMAL_F32 = 1.1754943508222875e-38;

/** Physical sample indices [start, end). */
export interface DirtyRange {
  start: number;
  end: number;
}

/** Logical sample indices [start, end); 0 is the oldest sample. */
export interface IndexRange {
  start: number;
  end: number;
}

/** f32 value with -0 turned into +0 and subnormals flushed to 0 (GPUs may flush them). */
export function canonicalY(y: number): number {
  const f = Math.fround(y);
  return f === 0 || Math.abs(f) < MIN_NORMAL_F32 ? 0 : f;
}

/**
 * Fixed-capacity ring of (t, y) samples, interleaved as f32 pairs, the same layout the GPU storage buffer uses.
 * t is stored relative to an integer `epoch` (absolute ms). Appends must be finite and non-decreasing in t
 * (see validateBatch). takeDirty() has exactly one consumer: the GPU uploader.
 */
export class Ring {
  readonly capacity: number;
  /** [t0, y0, t1, y1, ...] indexed by physical slot. */
  readonly data: Float32Array;
  /** Physical slot of the next write. */
  head = 0;
  count = 0;
  /** Absolute ms that relative times are measured from. Always an integer. */
  epoch = 0;
  /** How many times the epoch moved. */
  rebases = 0;
  /** Min and max of every y ever appended. Never shrinks. */
  yMin = Infinity;
  yMax = -Infinity;
  /** Bumped on every append that stores at least one sample. */
  version = 0;
  private dirty: DirtyRange[] = [];
  private full = false;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this.data = new Float32Array(capacity * 2);
  }

  /** Physical slot of logical index 0 (the oldest sample). */
  get oldest(): number {
    return (this.head - this.count + this.capacity) % this.capacity;
  }

  physical(k: number): number {
    return (this.oldest + k) % this.capacity;
  }

  tRel(k: number): number {
    return this.data[2 * this.physical(k)];
  }

  y(k: number): number {
    return this.data[2 * this.physical(k) + 1];
  }

  tAbs(k: number): number {
    return this.epoch + this.tRel(k);
  }

  /** Absolute time of the oldest sample, or +Infinity when empty. */
  firstT(): number {
    return this.count === 0 ? Infinity : this.tAbs(0);
  }

  /** Absolute time of the newest sample, or -Infinity when empty. */
  lastT(): number {
    return this.count === 0 ? -Infinity : this.tAbs(this.count - 1);
  }

  append(t: ArrayLike<number>, y: ArrayLike<number>): void {
    const n = t.length;
    if (y.length !== n) throw new RangeError(`t has ${n} samples but y has ${y.length}`);
    if (n === 0) return;
    const newest = t[n - 1];

    // Batch samples that would be evicted at once are skipped; so are all but the last `capacity`.
    let i0 = Math.max(0, n - this.capacity);
    while (i0 < n - 1 && newest - t[i0] > KEEP_MS) i0++;

    // Evict ring samples outside the time window (ADR 0005).
    while (this.count > 0 && newest - this.tAbs(0) > KEEP_MS) this.count--;

    if (this.count === 0) {
      this.epoch = Math.floor(t[i0]);
    } else if (newest - this.epoch >= MAX_SPAN_MS) {
      this.rebase(this.epoch + Math.floor(this.tRel(0)));
    }

    const k = n - i0;
    const start = this.head;
    for (let i = i0; i < n; i++) {
      const p = this.head;
      this.data[2 * p] = Math.fround(t[i] - this.epoch);
      const v = canonicalY(y[i]);
      this.data[2 * p + 1] = v;
      if (v < this.yMin) this.yMin = v;
      if (v > this.yMax) this.yMax = v;
      this.head = p + 1 === this.capacity ? 0 : p + 1;
      if (this.count < this.capacity) this.count++;
    }
    if (start + k <= this.capacity) {
      this.markDirty(start, start + k);
    } else {
      this.markDirty(start, this.capacity);
      this.markDirty(0, start + k - this.capacity);
    }
    this.version++;
  }

  /** Dirty physical ranges since the last call, then clears them. A full upload is [{0, capacity}]. */
  takeDirty(): DirtyRange[] {
    if (this.full) {
      this.full = false;
      this.dirty = [];
      return [{ start: 0, end: this.capacity }];
    }
    const out = this.dirty;
    this.dirty = [];
    return out;
  }

  /** Logical range of samples with t0 <= t <= t1 (absolute ms), by binary search. */
  visibleRange(t0: number, t1: number): IndexRange {
    if (!(t1 >= t0)) return { start: 0, end: 0 };
    const start = this.lowerBound(t0 - this.epoch, false);
    const end = this.lowerBound(t1 - this.epoch, true);
    return { start, end: Math.max(start, end) };
  }

  /** First logical k with tRel(k) >= x, or with tRel(k) > x when `after` is true. */
  private lowerBound(x: number, after: boolean): number {
    let lo = 0;
    let hi = this.count;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const v = this.tRel(mid);
      if (after ? v <= x : v < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private rebase(newEpoch: number): void {
    const shift = newEpoch - this.epoch;
    for (let k = 0; k < this.count; k++) {
      const p = 2 * this.physical(k);
      this.data[p] = Math.fround(this.data[p] - shift);
    }
    this.epoch = newEpoch;
    this.rebases++;
    this.full = true;
    this.dirty = [];
  }

  private markDirty(start: number, end: number): void {
    if (this.full || end <= start) return;
    const last = this.dirty[this.dirty.length - 1];
    if (last && last.end === start) last.end = end;
    else this.dirty.push({ start, end });
    let total = 0;
    for (const d of this.dirty) total += d.end - d.start;
    if (total >= this.capacity || this.dirty.length > 2) {
      this.full = true;
      this.dirty = [];
    }
  }
}
