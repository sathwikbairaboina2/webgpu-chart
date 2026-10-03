import { describe, expect, it } from "vitest";
import { validateBatch } from "../src/core/ingest";
import { Ring } from "../src/core/ring";

describe("validateBatch (invariant 5)", () => {
  it("drops non-finite t, non-finite y and y that overflow f32", () => {
    const v = validateBatch([1, NaN, 3, 4, 5], [1, 2, Infinity, 1e39, 5], -Infinity);
    expect(Array.from(v.t)).toEqual([1, 5]);
    expect(Array.from(v.y)).toEqual([1, 5]);
    expect(v.report).toEqual({ accepted: 2, droppedNonFinite: 3, droppedOutOfOrder: 0, clamped: 0 });
  });

  it("drops out-of-order samples with policy drop", () => {
    const v = validateBatch([5, 4, 6, 6], [1, 2, 3, 4], 5, "drop");
    expect(Array.from(v.t)).toEqual([5, 6, 6]);
    expect(v.report.droppedOutOfOrder).toBe(1);
  });

  it("clamps out-of-order samples to the last t with policy clamp-to-last", () => {
    const v = validateBatch([3, 7, 2], [1, 2, 3], 4, "clamp-to-last");
    expect(Array.from(v.t)).toEqual([4, 7, 7]);
    expect(v.report.clamped).toBe(2);
  });

  it("throws on length mismatch", () => {
    expect(() => validateBatch([1, 2], [1], 0)).toThrow(RangeError);
  });

  it("never lets a bad sample into the ring", () => {
    const r = new Ring(16);
    const a = validateBatch([1, 2, 3], [1, NaN, 3], r.lastT());
    r.append(a.t, a.y);
    const b = validateBatch([2, 4], [9, 4], r.lastT());
    r.append(b.t, b.y);
    expect(Array.from({ length: r.count }, (_, k) => r.tAbs(k))).toEqual([1, 3, 4]);
    expect(Array.from({ length: r.count }, (_, k) => r.y(k))).toEqual([1, 3, 4]);
  });
});
