import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Ring, canonicalY } from "../src/core/ring";

/** Naive model: a plain array that keeps the last `capacity` samples. */
function model(capacity: number, batches: number[]): number[] {
  const all: number[] = [];
  let t = 0;
  for (const k of batches) for (let i = 0; i < k; i++) all.push(t++);
  return all.slice(Math.max(0, all.length - capacity));
}

describe("Ring (invariant 3)", () => {
  it("never exceeds capacity and keeps exactly the newest samples", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 64 }),
        fc.array(fc.integer({ min: 0, max: 150 }), { maxLength: 30 }),
        (capacity, batches) => {
          const r = new Ring(capacity);
          let t = 0;
          for (const k of batches) {
            const ts = Array.from({ length: k }, () => t++);
            r.append(ts, ts.map((v) => v * 2));
            expect(r.count).toBeLessThanOrEqual(capacity);
          }
          const want = model(capacity, batches);
          expect(r.count).toBe(want.length);
          for (let k = 0; k < r.count; k++) {
            expect(r.tAbs(k)).toBe(want[k]);
            expect(r.y(k)).toBe(want[k] * 2);
          }
        },
      ),
    );
  });

  it("rejects a bad capacity and mismatched lengths", () => {
    expect(() => new Ring(0)).toThrow(RangeError);
    expect(() => new Ring(1.5)).toThrow(RangeError);
    expect(() => new Ring(4).append([1, 2], [1])).toThrow(RangeError);
  });

  it("stores canonical f32 y values", () => {
    const r = new Ring(4);
    r.append([0, 1, 2, 3], [-0, 1e-40, 0.1, -3]);
    expect(Object.is(r.y(0), 0)).toBe(true);
    expect(r.y(1)).toBe(0);
    expect(r.y(2)).toBe(Math.fround(0.1));
    expect(canonicalY(-1e-39)).toBe(0);
    expect(r.yMin).toBe(-3);
    expect(r.yMax).toBe(Math.fround(0.1));
  });
});

describe("Ring dirty ranges", () => {
  it("reports one range for a plain append and merges consecutive appends", () => {
    const r = new Ring(10);
    r.append([0, 1, 2], [0, 0, 0]);
    r.append([3, 4], [0, 0]);
    expect(r.takeDirty()).toEqual([{ start: 0, end: 5 }]);
    expect(r.takeDirty()).toEqual([]);
  });

  it("splits a wrapping append into two ranges", () => {
    const r = new Ring(10);
    r.append([0, 1, 2, 3, 4, 5, 6, 7], new Array(8).fill(0));
    r.takeDirty();
    r.append([8, 9, 10, 11], [0, 0, 0, 0]);
    expect(r.takeDirty()).toEqual([
      { start: 8, end: 10 },
      { start: 0, end: 2 },
    ]);
  });

  it("reports the whole ring when an append overwrites everything", () => {
    const r = new Ring(4);
    r.append([0, 1, 2, 3, 4, 5, 6], new Array(7).fill(1));
    expect(r.takeDirty()).toEqual([{ start: 0, end: 4 }]);
    expect(r.count).toBe(4);
    expect(r.tAbs(0)).toBe(3);
  });

  it("keeps at most two pending ranges when nobody takes them", () => {
    const r = new Ring(8);
    for (let i = 0; i < 100; i++) r.append([i], [i]);
    const d = r.takeDirty();
    expect(d.length).toBeLessThanOrEqual(2);
  });
});
