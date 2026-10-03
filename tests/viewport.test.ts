import { describe, expect, it } from "vitest";
import { clampView, followView, panBy, pxToTime, zoomAt } from "../src/core/viewport";
import { RollingWindow, percentile, summarize } from "../src/core/stats";

const bounds = { min: 0, max: 1000 };

describe("viewport", () => {
  it("zooms in around the anchor", () => {
    expect(zoomAt({ t0: 0, t1: 1000 }, 250, 0.5, bounds)).toEqual({ t0: 125, t1: 625 });
  });

  it("does not zoom out past the data or in past the minimum span", () => {
    expect(zoomAt({ t0: 100, t1: 900 }, 500, 10, bounds)).toEqual({ t0: 0, t1: 1000 });
    const v = zoomAt({ t0: 500, t1: 501 }, 500, 0.001, bounds);
    expect(v.t1 - v.t0).toBe(1);
  });

  it("pans but stays inside the data", () => {
    expect(panBy({ t0: 0, t1: 100 }, 50, bounds)).toEqual({ t0: 50, t1: 150 });
    expect(panBy({ t0: 0, t1: 100 }, -50, bounds)).toEqual({ t0: 0, t1: 100 });
    expect(panBy({ t0: 800, t1: 900 }, 500, bounds)).toEqual({ t0: 900, t1: 1000 });
  });

  it("survives empty bounds and non-finite input", () => {
    expect(clampView({ t0: NaN, t1: NaN }, { min: 0, max: 0 })).toEqual({ t0: 0, t1: 1 });
  });

  it("follows the newest sample and maps pixels to time", () => {
    expect(followView(5000, 1000)).toEqual({ t0: 4000, t1: 5000 });
    expect(pxToTime(50, 100, { t0: 0, t1: 1000 })).toBe(500);
  });
});

describe("stats", () => {
  it("uses nearest-rank percentiles", () => {
    const s = Float64Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(s, 50)).toBe(50);
    expect(percentile(s, 95)).toBe(95);
    expect(percentile(s, 100)).toBe(100);
    expect(percentile([], 50)).toBeNaN();
  });

  it("summarizes frame times and counts frames over the 60 Hz budget", () => {
    const sum = summarize([10, 20, 5, 30]);
    expect(sum).toMatchObject({ n: 4, p50: 10, max: 30, over16ms: 2 });
    expect(sum.mean).toBe(16.25);
  });

  it("keeps only the last window of values", () => {
    const w = new RollingWindow(1000);
    w.push(0, 100);
    w.push(500, 1);
    w.push(1400, 2);
    expect(w.size).toBe(2);
    expect(w.percentile(95)).toBe(2);
  });
});
