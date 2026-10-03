/** Nearest-rank percentile of an ascending array. NaN when empty. */
export function percentile(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const rank = Math.ceil((p / 100) * n);
  return sorted[Math.min(n, Math.max(1, rank)) - 1];
}

/** Frame budget at 60 Hz. */
export const BUDGET_60HZ_MS = 1000 / 60;

export interface Summary {
  n: number;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  max: number;
  /** Samples above the 60 Hz budget (16.67 ms). */
  over16ms: number;
}

export function summarize(samples: ArrayLike<number>): Summary {
  const s = Float64Array.from(samples).sort();
  let sum = 0;
  let over = 0;
  for (let i = 0; i < s.length; i++) {
    sum += s[i];
    if (s[i] > BUDGET_60HZ_MS) over++;
  }
  return {
    n: s.length,
    p50: percentile(s, 50),
    p95: percentile(s, 95),
    p99: percentile(s, 99),
    mean: s.length ? sum / s.length : NaN,
    max: s.length ? s[s.length - 1] : NaN,
    over16ms: over,
  };
}

/** Values from the last `windowMs` of time. */
export class RollingWindow {
  private times: number[] = [];
  private values: number[] = [];

  constructor(readonly windowMs: number) {}

  push(now: number, value: number): void {
    this.times.push(now);
    this.values.push(value);
    while (this.times.length > 0 && now - this.times[0] > this.windowMs) {
      this.times.shift();
      this.values.shift();
    }
  }

  get size(): number {
    return this.values.length;
  }

  percentile(p: number): number {
    return percentile(Float64Array.from(this.values).sort(), p);
  }
}
