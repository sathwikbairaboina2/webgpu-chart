import { BUCKET_FLOATS, type Buckets } from "./decimate";

/** Maps values to pixel rows. Row 0 is the top. */
export interface YMap {
  yMin: number;
  yMax: number;
  heightPx: number;
}

export function yToPx(y: number, m: YMap): number {
  const span = m.yMax - m.yMin;
  return ((m.yMax - y) / (span === 0 ? 1 : span)) * m.heightPx;
}

/** Floats needed for the worst case: a band and a connector per column, 4 floats each. */
export function segmentCapacity(width: number): number {
  return width * 8;
}

/**
 * Writes line segments [x0, y0, x1, y1] in pixel space and returns how many it wrote.
 * Rule (spec section 4.7, mirrored by segments.wgsl):
 * - every non-empty column c gets a band (c + 0.5, px(maxY) - 0.5) -> (c + 0.5, px(minY) + 0.5);
 * - it also gets a connector (p + 0.5, px(lastY_p)) -> (c + 0.5, px(firstY_c)) from the previous non-empty
 *   column p when c - p <= maxGapPx. Wider gaps stay gaps.
 * The connector is written before the band.
 */
export function segmentsInto(b: Buckets, m: YMap, maxGapPx: number, out: Float32Array): number {
  if (out.length < segmentCapacity(b.width)) throw new RangeError("segment buffer too small");
  const { f32, u32 } = b;
  let n = 0;
  let prev = -1;
  for (let c = 0; c < b.width; c++) {
    const o = c * BUCKET_FLOATS;
    if (u32[o + 4] === 0) continue;
    const x = c + 0.5;
    if (prev >= 0 && c - prev <= maxGapPx) {
      const w = 4 * n++;
      out[w] = prev + 0.5;
      out[w + 1] = yToPx(f32[prev * BUCKET_FLOATS + 3], m);
      out[w + 2] = x;
      out[w + 3] = yToPx(f32[o + 2], m);
    }
    const w = 4 * n++;
    out[w] = x;
    out[w + 1] = yToPx(f32[o + 1], m) - 0.5;
    out[w + 2] = x;
    out[w + 3] = yToPx(f32[o], m) + 0.5;
    prev = c;
  }
  return n;
}

export function segmentsFromBuckets(b: Buckets, m: YMap, maxGapPx: number): Float32Array {
  const out = new Float32Array(segmentCapacity(b.width));
  const n = segmentsInto(b, m, maxGapPx, out);
  return out.slice(0, n * 4);
}
