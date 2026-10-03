import { mulberry32 } from "./prng";

/** Probability that a sample is a one-sample spike. */
export const SPIKE_PROBABILITY = 1 / 20_000;
/** Height of a spike above or below the walk. */
export const SPIKE_HEIGHT = 25;
/** Largest step of the walk per sample. */
export const WALK_STEP = 0.08;
/** Pull back toward the level per sample (time constant 50,000 samples). */
export const REVERSION = 0.00002;

/**
 * Random walk that drifts around `level`, with rare one-sample spikes. Deterministic for a seed.
 * Values are f32 (Math.fround), so they survive a Float32Array round trip unchanged.
 */
export class Walk {
  private readonly rnd: () => number;
  private y: number;

  constructor(
    seed: number,
    private readonly level = 0,
  ) {
    this.rnd = mulberry32(seed);
    this.y = level;
  }

  next(): number {
    this.y += (this.rnd() * 2 - 1) * WALK_STEP - (this.y - this.level) * REVERSION;
    if (this.rnd() < SPIKE_PROBABILITY) {
      return Math.fround(this.y + (this.rnd() < 0.5 ? -SPIKE_HEIGHT : SPIKE_HEIGHT));
    }
    return Math.fround(this.y);
  }
}

export interface DatasetSpec {
  seed: number;
  series: number;
  points: number;
  /** Absolute time of sample 0, Unix ms. */
  startMs: number;
  stepMs: number;
}

export interface SeriesData {
  /** Absolute Unix ms. Shared by all series of one dataset. */
  t: Float64Array;
  y: Float32Array;
}

export function makeDataset(spec: DatasetSpec): SeriesData[] {
  const t = new Float64Array(spec.points);
  for (let i = 0; i < spec.points; i++) t[i] = spec.startMs + i * spec.stepMs;
  const out: SeriesData[] = [];
  for (let s = 0; s < spec.series; s++) {
    const walk = new Walk(spec.seed + s * 7919, s * 12);
    const y = new Float32Array(spec.points);
    for (let i = 0; i < spec.points; i++) y[i] = walk.next();
    out.push({ t, y });
  }
  return out;
}

/** Min and max over all series, padded by 5%. [0, 1] when there is no data. */
export function yExtent(data: SeriesData[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of data) {
    for (let i = 0; i < s.y.length; i++) {
      const v = s.y[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (lo > hi) return [0, 1];
  const pad = (hi - lo) * 0.05 || 1;
  return [lo - pad, hi + pad];
}
