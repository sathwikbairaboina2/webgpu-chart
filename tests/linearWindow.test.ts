import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { LinearWindow } from "../src/baselines/linearWindow";

describe("LinearWindow", () => {
  it("always holds the newest `capacity` samples in order", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), fc.array(fc.integer({ min: 0, max: 90 }), { maxLength: 40 }), (cap, batches) => {
        const w = new LinearWindow(cap, 2);
        const all: number[] = [];
        let t = 0;
        for (const k of batches) {
          const x = Array.from({ length: k }, () => t++);
          all.push(...x);
          w.append(x, [x.map((v) => v * 2), x.map((v) => -v)]);
        }
        const want = all.slice(Math.max(0, all.length - cap));
        const v = w.view();
        expect(Array.from(v.x)).toEqual(want);
        expect(Array.from(v.y[0])).toEqual(want.map((n) => n * 2));
        expect(Array.from(v.y[1])).toEqual(want.map((n) => -n));
      }),
    );
  });

  it("rejects wrong column counts and lengths", () => {
    const w = new LinearWindow(4, 1);
    expect(() => w.append([1], [])).toThrow(RangeError);
    expect(() => w.append([1, 2], [[1]])).toThrow(RangeError);
  });
});
