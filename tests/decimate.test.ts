import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Ring } from "../src/core/ring";
import { BUCKET_FLOATS, columnOf, createBuckets, decimate, makeParams } from "../src/core/decimate";

function ringOf(ts: number[], ys: number[], capacity = ts.length): Ring {
  const r = new Ring(capacity);
  r.append(ts, ys);
  return r;
}

const bucket = (b: ReturnType<typeof decimate>, c: number) => ({
  minY: b.f32[c * BUCKET_FLOATS],
  maxY: b.f32[c * BUCKET_FLOATS + 1],
  firstY: b.f32[c * BUCKET_FLOATS + 2],
  lastY: b.f32[c * BUCKET_FLOATS + 3],
  n: b.u32[c * BUCKET_FLOATS + 4],
});

describe("columnOf", () => {
  it("clamps to [0, width - 1] and uses f32 arithmetic", () => {
    expect(columnOf(-5, 0, 1, 10)).toBe(0);
    expect(columnOf(50, 0, 1, 10)).toBe(9);
    expect(columnOf(3.5, 0, 1, 10)).toBe(3);
    const t0 = Math.fround(0.1);
    const scale = Math.fround(1 / 3);
    expect(columnOf(Math.fround(3.1), t0, scale, 100)).toBe(Math.floor(Math.fround(Math.fround(Math.fround(3.1) - t0) * scale)));
  });
});

describe("decimate", () => {
  it("computes min, max, first, last and n per column", () => {
    // 10 samples over [0, 9] into 2 columns of 5 ms each.
    const r = ringOf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [5, 1, 9, 2, 3, 4, 8, 0, 6, 7]);
    const b = decimate(r, makeParams(r, { t0: 0, t1: 10 }, 2));
    expect(bucket(b, 0)).toEqual({ minY: 1, maxY: 9, firstY: 5, lastY: 3, n: 5 });
    expect(bucket(b, 1)).toEqual({ minY: 0, maxY: 8, firstY: 4, lastY: 7, n: 5 });
  });

  it("leaves empty columns as zero bytes and handles an empty window", () => {
    const r = ringOf([0, 100], [3, 4]);
    const b = decimate(r, makeParams(r, { t0: 0, t1: 100 }, 10));
    expect(bucket(b, 5)).toEqual({ minY: 0, maxY: 0, firstY: 0, lastY: 0, n: 0 });
    expect(bucket(b, 9).n).toBe(1);
    const empty = decimate(r, makeParams(r, { t0: 40, t1: 60 }, 10));
    expect(Array.from(empty.u32).every((v) => v === 0)).toBe(true);
  });

  it("puts every sample of a zero-span window in column 0", () => {
    const r = ringOf([5, 5, 5], [1, 2, 3]);
    const b = decimate(r, makeParams(r, { t0: 5, t1: 5 }, 4));
    expect(bucket(b, 0)).toEqual({ minY: 1, maxY: 3, firstY: 1, lastY: 3, n: 3 });
  });

  it("reads across the ring wrap point", () => {
    const r = new Ring(4);
    r.append([0, 1, 2, 3, 4, 5], [0, 0, 7, 8, 9, 1]);
    const b = decimate(r, makeParams(r, { t0: 2, t1: 5 }, 1));
    expect(bucket(b, 0)).toEqual({ minY: 1, maxY: 9, firstY: 7, lastY: 1, n: 4 });
  });

  it("rejects a width mismatch and a bad width", () => {
    const r = ringOf([0, 1], [0, 1]);
    expect(() => decimate(r, makeParams(r, { t0: 0, t1: 1 }, 4), createBuckets(3))).toThrow(RangeError);
    expect(() => makeParams(r, { t0: 0, t1: 1 }, 0)).toThrow(RangeError);
  });
});

describe("decimate spike property (invariant 2)", () => {
  it("shows a single extreme sample in its column's max (or min) at any zoom", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 3000 }),
        fc.integer({ min: 1, max: 2000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.boolean(),
        fc.integer(),
        (n, width, spikeAt, a, b, up, seed) => {
          let s = seed >>> 0;
          const ys = Array.from({ length: n }, () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 10 - 5);
          const ts = Array.from({ length: n }, (_, i) => 1_759_000_000_000 + i * 3);
          const k = Math.min(n - 1, Math.floor(spikeAt * n));
          ys[k] = up ? 1000 : -1000;
          const r = new Ring(n);
          r.append(ts, ys);
          const lo = Math.min(a, b) * k;
          const hi = k + Math.max(a, b) * (n - 1 - k);
          const view = { t0: ts[Math.floor(lo)], t1: ts[Math.ceil(hi)] };
          const p = makeParams(r, view, width);
          const out = decimate(r, p);
          const c = columnOf(r.tRel(k), p.t0, p.scale, width);
          if (up) expect(out.f32[c * BUCKET_FLOATS + 1]).toBe(1000);
          else expect(out.f32[c * BUCKET_FLOATS]).toBe(-1000);
        },
      ),
      { numRuns: 300 },
    );
  });
});
