import { describe, expect, it } from "vitest";
import { MAX_SPAN_MS, Ring } from "../src/core/ring";

describe("Ring epochs (invariant 6)", () => {
  it("keeps relative time within 2^24 ms over a 6-hour 10 Hz stream and rebases", () => {
    const r = new Ring(1_000_000);
    const start = 1_759_536_000_000;
    const hz = 10;
    const total = 6 * 3600 * hz;
    let maxRel = 0;
    for (let i = 0; i < total; i += 1000) {
      const ts: number[] = [];
      for (let j = i; j < Math.min(total, i + 1000); j++) ts.push(start + j * (1000 / hz));
      r.append(ts, ts.map(() => 1));
      maxRel = Math.max(maxRel, r.tRel(r.count - 1));
      expect(r.tRel(0)).toBeGreaterThanOrEqual(0);
    }
    expect(r.rebases).toBeGreaterThan(0);
    expect(maxRel).toBeLessThanOrEqual(MAX_SPAN_MS);
    expect(r.lastT()).toBe(start + (total - 1) * 100);
    expect(r.lastT() - r.firstT()).toBeLessThan(MAX_SPAN_MS);
  });

  it("marks the whole ring dirty after a rebase and keeps times exact", () => {
    const r = new Ring(100);
    const t0 = 1_000_000;
    r.append([t0, t0 + 10_000], [1, 2]);
    r.takeDirty();
    r.append([t0 + MAX_SPAN_MS - 2], [3]);
    expect(r.rebases).toBe(0);
    r.append([t0 + 10_000 + MAX_SPAN_MS - 5], [4]);
    expect(r.rebases).toBe(1);
    expect(r.takeDirty()).toEqual([{ start: 0, end: 100 }]);
    expect(r.tAbs(0)).toBe(t0 + 10_000);
    expect(r.lastT()).toBe(t0 + 10_000 + MAX_SPAN_MS - 5);
  });

  it("evicts samples older than the span window", () => {
    const r = new Ring(100);
    r.append([0, 1, 2], [1, 1, 1]);
    r.append([MAX_SPAN_MS + 1], [1]);
    expect(r.firstT()).toBe(2);
    expect(r.count).toBe(2);
  });
});
