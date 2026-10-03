import { describe, expect, it } from "vitest";
import { Ring } from "../src/core/ring";
import { createBuckets, decimate, makeParams } from "../src/core/decimate";
import { segmentsFromBuckets, segmentsInto, yToPx } from "../src/core/segments";

const map = { yMin: 0, yMax: 10, heightPx: 100 };

describe("yToPx", () => {
  it("maps yMax to the top row and yMin to the bottom", () => {
    expect(yToPx(10, map)).toBe(0);
    expect(yToPx(0, map)).toBe(100);
    expect(yToPx(5, { yMin: 5, yMax: 5, heightPx: 100 })).toBe(0);
  });
});

describe("segmentsFromBuckets", () => {
  it("draws a band per column and connectors between neighbours", () => {
    const r = new Ring(4);
    r.append([0, 1, 2, 3], [2, 4, 6, 8]);
    const b = decimate(r, makeParams(r, { t0: 0, t1: 4 }, 2));
    const s = Array.from(segmentsFromBuckets(b, map, 32));
    // column 0: band only (first=2,last=4); column 1: connector from (0.5, px(4)) to (1.5, px(6)), then band.
    expect(s).toEqual([0.5, 59.5, 0.5, 80.5, 0.5, 60, 1.5, 40, 1.5, 19.5, 1.5, 40.5]);
  });

  it("leaves gaps wider than maxGapPx open", () => {
    const r = new Ring(2);
    r.append([0, 99], [1, 1]);
    const b = decimate(r, makeParams(r, { t0: 0, t1: 100 }, 100));
    expect(segmentsFromBuckets(b, map, 32).length).toBe(8);
    expect(segmentsFromBuckets(b, map, 100).length).toBe(12);
  });

  it("draws nothing for empty buckets and checks the buffer size", () => {
    const b = createBuckets(10);
    expect(segmentsFromBuckets(b, map, 32).length).toBe(0);
    expect(() => segmentsInto(b, map, 32, new Float32Array(3))).toThrow(RangeError);
  });
});
