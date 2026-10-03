import type { Ring } from "./ring";

/** Floats per bucket record. A record is 32 bytes: minY, maxY, firstY, lastY (f32), n (u32), 3 x u32 padding. */
export const BUCKET_FLOATS = 8;
export const BUCKET_BYTES = 32;
/** Smallest time span a viewport may have when computing the scale (avoids division by zero). */
export const MIN_SPAN_MS = 1e-3;

/** Inputs of the bucketing contract (ADR 0002). Shared by the CPU reference and the GPU kernel. */
export interface DecimateParams {
  /** Viewport start, f32 ms relative to the ring epoch. */
  t0: number;
  /** f32 columns per ms. */
  scale: number;
  /** Number of columns (device pixels). */
  width: number;
  /** Logical index range of visible samples. */
  start: number;
  end: number;
}

/** Bucket records in the GPU layout. f32 and u32 view the same buffer. */
export interface Buckets {
  width: number;
  buffer: ArrayBuffer;
  f32: Float32Array;
  u32: Uint32Array;
}

export function createBuckets(width: number): Buckets {
  const buffer = new ArrayBuffer(width * BUCKET_BYTES);
  return { width, buffer, f32: new Float32Array(buffer), u32: new Uint32Array(buffer) };
}

export function makeParams(ring: Ring, view: { t0: number; t1: number }, width: number): DecimateParams {
  if (!Number.isInteger(width) || width < 1) throw new RangeError(`width must be a positive integer, got ${width}`);
  const { start, end } = ring.visibleRange(view.t0, view.t1);
  const span = Math.max(view.t1 - view.t0, MIN_SPAN_MS);
  return {
    t0: Math.fround(view.t0 - ring.epoch),
    scale: Math.fround(width / span),
    width,
    start,
    end,
  };
}

/** Column of a sample: clamp(floor(f32(f32(t - t0) * scale)), 0, width - 1). Matches decimate.wgsl bit for bit. */
export function columnOf(t: number, t0: number, scale: number, width: number): number {
  const c = Math.floor(Math.fround(Math.fround(t - t0) * scale));
  return c < 0 ? 0 : c > width - 1 ? width - 1 : c;
}

/** CPU reference M4 decimation: min, max, first, last and count per column. Empty columns are all zero bytes. */
export function decimate(ring: Ring, p: DecimateParams, out: Buckets = createBuckets(p.width)): Buckets {
  if (out.width !== p.width) throw new RangeError(`buckets have width ${out.width}, params have ${p.width}`);
  const { f32, u32 } = out;
  f32.fill(0);
  const data = ring.data;
  const cap = ring.capacity;
  let i = (ring.oldest + p.start) % cap;
  for (let k = p.start; k < p.end; k++) {
    const t = data[2 * i];
    const y = data[2 * i + 1];
    const o = columnOf(t, p.t0, p.scale, p.width) * BUCKET_FLOATS;
    if (u32[o + 4] === 0) {
      f32[o] = y;
      f32[o + 1] = y;
      f32[o + 2] = y;
    } else {
      if (y < f32[o]) f32[o] = y;
      if (y > f32[o + 1]) f32[o + 1] = y;
    }
    f32[o + 3] = y;
    u32[o + 4]++;
    i = i + 1 === cap ? 0 : i + 1;
  }
  return out;
}
