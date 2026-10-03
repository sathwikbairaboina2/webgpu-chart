import { describe, expect, it } from "vitest";
import { formatTime, formatValue, niceStep, niceTicks, timeStep, timeTicks } from "../src/core/ticks";

describe("niceTicks", () => {
  it("uses 1-2-5 steps inside the range", () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(-3.2, 7.9, 6)).toEqual([-2, 0, 2, 4, 6]);
    expect(niceTicks(0.1, 0.35, 5)).toEqual([0.1, 0.15, 0.2, 0.25, 0.3, 0.35]);
  });

  it("handles degenerate ranges", () => {
    expect(niceTicks(5, 5)).toEqual([5]);
    expect(niceTicks(NaN, 1)).toEqual([]);
  });
});

describe("timeTicks", () => {
  it("picks a step from the allowed list and aligns ticks to it", () => {
    expect(timeStep(10_000, 8)).toBe(2_000);
    const { step, ticks } = timeTicks(1_500, 9_700, 8);
    expect(step).toBe(2_000);
    expect(ticks).toEqual([2_000, 4_000, 6_000, 8_000]);
  });

  it("aligns hour ticks to the given time zone offset", () => {
    const ist = 5.5 * 3600_000;
    const { ticks } = timeTicks(0, 10 * 3600_000, 8, ist);
    expect((ticks[0] + ist) % (2 * 3600_000)).toBe(0);
  });

  it("formats labels by step size in UTC", () => {
    const t = Date.UTC(2026, 9, 4, 13, 5, 9, 42);
    expect(formatTime(t, 86_400_000, true)).toBe("2026-10-04");
    expect(formatTime(t, 60_000, true)).toBe("13:05");
    expect(formatTime(t, 1_000, true)).toBe("13:05:09");
    expect(formatTime(t, 10, true)).toBe("05:09.042");
  });

  it("formats values with decimals that match the step", () => {
    expect(formatValue(2, 1)).toBe("2");
    expect(formatValue(0.25, 0.05)).toBe("0.25");
    expect(formatValue(1500, 500)).toBe("1500");
  });
});
