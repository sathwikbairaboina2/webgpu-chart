import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/core/prng";
import { Walk, makeDataset, yExtent } from "../src/core/dataset";

describe("mulberry32", () => {
  it("is deterministic per seed and stays in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("Walk", () => {
  it("returns f32 values and the same sequence for the same seed", () => {
    const a = new Walk(7);
    const b = new Walk(7);
    for (let i = 0; i < 1000; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(Math.fround(v)).toBe(v);
    }
  });
});

describe("makeDataset", () => {
  it("builds evenly spaced shared timestamps and one walk per series", () => {
    const d = makeDataset({ seed: 1, series: 3, points: 500, startMs: 1_000, stepMs: 2 });
    expect(d).toHaveLength(3);
    expect(d[0].t[0]).toBe(1_000);
    expect(d[0].t[499]).toBe(1_998);
    expect(d[1].t).toBe(d[0].t);
    expect(d[0].y).not.toEqual(d[1].y);
    const again = makeDataset({ seed: 1, series: 3, points: 500, startMs: 1_000, stepMs: 2 });
    expect(again[2].y).toEqual(d[2].y);
  });

  it("yExtent pads the range and has a default for no data", () => {
    const [lo, hi] = yExtent([{ t: new Float64Array([0, 1]), y: new Float32Array([0, 10]) }]);
    expect(lo).toBeCloseTo(-0.5);
    expect(hi).toBeCloseTo(10.5);
    expect(yExtent([])).toEqual([0, 1]);
  });
});
