import { Walk } from "../core/dataset";

export interface SyntheticOptions {
  series: number;
  seed: number;
  /** Samples per second per series. */
  hz: number;
  /** Batch interval. Default 16 ms. */
  intervalMs?: number;
  /** Clock. Default Date.now. */
  now?: () => number;
  /** Level each walk drifts around, by series index. Default 12 x index (same as makeDataset). */
  level?: (series: number) => number;
}

export type BatchListener = (series: number, t: Float64Array, y: Float32Array) => void;

/**
 * Timer-driven synthetic stream (ADR 0007). Every interval it emits, per series, the samples whose time slots
 * (multiples of 1000 / hz ms) passed since the last tick. Same seed, same values.
 */
export class SyntheticSource {
  private readonly walks: Walk[];
  private readonly periodMs: number;
  private readonly now: () => number;
  private nextT = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<BatchListener>();

  constructor(private readonly opts: SyntheticOptions) {
    if (!(opts.hz > 0)) throw new RangeError(`hz must be positive, got ${opts.hz}`);
    this.periodMs = 1000 / opts.hz;
    this.now = opts.now ?? Date.now;
    this.walks = Array.from({ length: opts.series }, (_, s) => new Walk(opts.seed + 104_729 * (s + 1), opts.level?.(s) ?? s * 12));
  }

  onBatch(fn: BatchListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Starts emitting from `fromT` (absolute ms, default now). */
  start(fromT: number = this.now()): void {
    if (this.timer) return;
    this.nextT = fromT;
    this.timer = setInterval(() => this.tick(), this.opts.intervalMs ?? 16);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /** Emits every sample due up to now. Public for tests. */
  tick(): void {
    const end = this.now();
    const k = Math.max(0, Math.floor((end - this.nextT) / this.periodMs) + 1);
    if (k === 0) return;
    const t = new Float64Array(k);
    for (let i = 0; i < k; i++) t[i] = this.nextT + i * this.periodMs;
    this.nextT += k * this.periodMs;
    for (let s = 0; s < this.walks.length; s++) {
      const y = new Float32Array(k);
      for (let i = 0; i < k; i++) y[i] = this.walks[s].next();
      for (const fn of this.listeners) fn(s, t, y);
    }
  }
}
