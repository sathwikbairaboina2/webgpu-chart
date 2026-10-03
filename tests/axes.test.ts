import { describe, expect, it } from "vitest";
import { axesKey, layoutAxes } from "../src/chart/axes";

const plot = { left: 56, top: 8, width: 1000, height: 400 };

describe("layoutAxes", () => {
  it("places time ticks across the plot and value ticks top to bottom", () => {
    const l = layoutAxes({ t0: 0, t1: 10_000 }, [0, 100], plot, { tzOffsetMs: 0, utc: true });
    expect(l.x.map((t) => t.label)).toEqual(["00:00:00", "00:00:02", "00:00:04", "00:00:06", "00:00:08", "00:00:10"]);
    expect(l.x[0].px).toBe(56);
    expect(l.x.at(-1)!.px).toBe(1056);
    expect(l.y[0]).toEqual({ px: 408, label: "0" });
    expect(l.y.at(-1)).toEqual({ px: 8, label: "100" });
  });

  it("survives a zero-length window", () => {
    const l = layoutAxes({ t0: 5, t1: 5 }, [0, 1], plot, { tzOffsetMs: 0, utc: true });
    expect(l.x).toHaveLength(1);
    expect(Number.isFinite(l.x[0].px)).toBe(true);
  });

  it("changes the key only when the drawing would change", () => {
    const a = layoutAxes({ t0: 0, t1: 10_000 }, [0, 100], plot, { tzOffsetMs: 0, utc: true });
    const b = layoutAxes({ t0: -0.001, t1: 10_000.001 }, [0, 100], plot, { tzOffsetMs: 0, utc: true });
    const c = layoutAxes({ t0: 500, t1: 10_500 }, [0, 100], plot, { tzOffsetMs: 0, utc: true });
    expect(axesKey(a)).toBe(axesKey(b));
    expect(axesKey(a)).not.toBe(axesKey(c));
  });
});
