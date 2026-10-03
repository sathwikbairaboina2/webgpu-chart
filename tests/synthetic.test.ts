import { describe, expect, it, vi } from "vitest";
import { SyntheticSource } from "../src/adapters/synthetic";

describe("SyntheticSource", () => {
  it("emits every due sample once, evenly spaced, for every series", () => {
    let now = 1_000;
    const src = new SyntheticSource({ series: 2, seed: 1, hz: 1000, now: () => now });
    const got: [number, number[]][] = [];
    src.onBatch((s, t) => got.push([s, Array.from(t)]));
    src.start(1_000);
    src.stop();
    src.tick();
    now = 1_004;
    src.tick();
    now = 1_004.5;
    src.tick();
    expect(got).toEqual([
      [0, [1000]],
      [1, [1000]],
      [0, [1001, 1002, 1003, 1004]],
      [1, [1001, 1002, 1003, 1004]],
    ]);
  });

  it("is deterministic per seed and stops its timer", () => {
    vi.useFakeTimers();
    let now = 0;
    const a = new SyntheticSource({ series: 1, seed: 9, hz: 100, now: () => now });
    const b = new SyntheticSource({ series: 1, seed: 9, hz: 100, now: () => now });
    const ya: number[] = [];
    const yb: number[] = [];
    a.onBatch((_s, _t, y) => ya.push(...y));
    b.onBatch((_s, _t, y) => yb.push(...y));
    a.start(0);
    b.start(0);
    now = 100;
    vi.advanceTimersByTime(16);
    expect(ya.length).toBe(11);
    expect(ya).toEqual(yb);
    a.stop();
    b.stop();
    expect(a.running).toBe(false);
    vi.useRealTimers();
  });

  it("rejects a non-positive rate", () => {
    expect(() => new SyntheticSource({ series: 1, seed: 1, hz: 0 })).toThrow(RangeError);
  });
});
