import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Ring } from "../src/core/ring";

describe("Ring.visibleRange (invariant 4)", () => {
  it("returns exactly the samples with t0 <= t <= t1, across the wrap point", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 200 }),
        fc.integer({ min: -5, max: 400 }),
        fc.integer({ min: 0, max: 400 }),
        (capacity, gaps, a, len) => {
          const r = new Ring(capacity);
          let t = 1_700_000_000_000;
          const ts = gaps.map((g) => (t += g));
          r.append(ts, ts.map(() => 1));
          const t0 = 1_700_000_000_000 + a;
          const t1 = t0 + len;
          const { start, end } = r.visibleRange(t0, t1);
          const want: number[] = [];
          for (let k = 0; k < r.count; k++) {
            const rel = r.tRel(k);
            if (rel >= t0 - r.epoch && rel <= t1 - r.epoch) want.push(k);
          }
          const got = Array.from({ length: end - start }, (_, i) => start + i);
          expect(got).toEqual(want);
        },
      ),
    );
  });

  it("returns an empty range for an empty ring or an inverted window", () => {
    const r = new Ring(8);
    expect(r.visibleRange(0, 10)).toEqual({ start: 0, end: 0 });
    r.append([1, 2, 3], [0, 0, 0]);
    const inv = r.visibleRange(3, 1);
    expect(inv.end - inv.start).toBe(0);
  });
});
