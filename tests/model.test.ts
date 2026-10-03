import { describe, expect, it } from "vitest";
import { ChartModel, MAX_SERIES } from "../src/chart/model";

const make = () => new ChartModel({ capacity: 100, windowMs: 10, orderPolicy: "drop" });

describe("ChartModel", () => {
  it("adds series with default colors and rejects duplicates and a ninth series", () => {
    const m = make();
    expect(m.addSeries("a").color).toBe("#4dabf7");
    expect(() => m.addSeries("a")).toThrow(/already exists/);
    for (let i = 1; i < MAX_SERIES; i++) m.addSeries(`s${i}`);
    expect(() => m.addSeries("x")).toThrow(/at most 8/);
  });

  it("validates appends, reports drops and notifies listeners with accepted samples only", () => {
    const m = make();
    m.addSeries("a");
    const seen: number[][] = [];
    m.onAppend((i, t) => seen.push([i, ...t]));
    const rep = m.append("a", [1, 2, NaN, 0], [1, 2, 3, 4]);
    expect(rep).toEqual({ accepted: 2, droppedNonFinite: 1, droppedOutOfOrder: 1, clamped: 0 });
    expect(seen).toEqual([[0, 1, 2]]);
    m.append("a", [NaN], [1]);
    expect(seen).toHaveLength(1);
    expect(() => m.append("zz", [1], [1])).toThrow(/unknown series/);
  });

  it("follows the newest sample until the user pans or zooms", () => {
    const m = make();
    m.addSeries("a");
    m.append("a", [0, 50, 100], [0, 1, 2]);
    expect(m.following).toBe(true);
    expect(m.resolveView()).toEqual({ t0: 90, t1: 100 });
    m.setViewport({ t0: 0, t1: 100 });
    m.zoomAtPx(50, 100, 0.5);
    expect(m.resolveView()).toEqual({ t0: 25, t1: 75 });
    m.panPx(50, 100);
    expect(m.resolveView()).toEqual({ t0: 0, t1: 50 });
    m.setViewport("follow");
    expect(m.following).toBe(true);
  });

  it("auto y range pads the data range and handles flat and empty data", () => {
    const m = make();
    expect(m.resolveY()).toEqual([0, 1]);
    m.addSeries("a");
    m.append("a", [0], [5]);
    expect(m.resolveY()).toEqual([4, 6]);
    m.append("a", [1], [15]);
    expect(m.resolveY()).toEqual([4.5, 15.5]);
    m.setYRange([-1, 1]);
    expect(m.resolveY()).toEqual([-1, 1]);
  });

  it("bounds cover every series", () => {
    const m = make();
    expect(m.bounds()).toEqual({ min: 0, max: 1 });
    m.addSeries("a");
    m.addSeries("b");
    m.append("a", [10, 20], [0, 0]);
    m.append("b", [5, 15], [0, 0]);
    expect(m.bounds()).toEqual({ min: 5, max: 20 });
  });
});
