import { describe, expect, it } from "vitest";
import { makeDataset } from "../src/core/dataset";
import { ChartModel } from "../src/chart/model";
import type { FrameStats } from "../src/chart/backend";
import { makeScript, totalAppend, SCRIPT_ID } from "../src/bench/script";
import { Fnv1a } from "../src/bench/fairness";
import { runRenderer, type BenchChart } from "../src/bench/runner";

function fakeChart(record: string[]): BenchChart {
  const model = new ChartModel({ capacity: 2_000, windowMs: 100, orderPolicy: "drop" });
  model.addSeries("s0");
  model.addSeries("s1");
  model.onAppend((i, t, y) => record.push(`append ${i} ${t.length} ${t[0]} ${y[0]}`));
  return {
    model,
    frame(): FrameStats {
      const v = model.resolveView();
      record.push(`view ${v.t0} ${v.t1}`);
      return { kind: "canvas2d", frameMs: 0, drawMs: 0, drawP95Ms: 0, gpuMs: 0.5, visiblePoints: 0, uploadBytes: 8 };
    },
  };
}

function fakeRaf(stepMs: number) {
  let now = 1000;
  return (cb: (t: number) => void) => queueMicrotask(() => cb((now += stepMs)));
}

describe("makeScript", () => {
  it("has four phases and spreads ingest over the nominal frame rate", () => {
    const steps = makeScript({ frames: 40, startMs: 0, points: 1001, stepMs: 1, ingestHz: 1000 });
    expect(steps).toHaveLength(40);
    expect(steps[0]).toEqual({ kind: "view", t0: 0, t1: 250 });
    expect(steps[9]).toEqual({ kind: "view", t0: 750, t1: 1000 });
    const zoomedIn = steps[19] as { t0: number; t1: number };
    expect(zoomedIn.t1 - zoomedIn.t0).toBeCloseTo(1, 6);
    expect(steps.slice(30).every((s) => s.kind === "follow")).toBe(true);
    expect(totalAppend(steps)).toBe(Math.floor((10 * 1000) / 60));
    expect(SCRIPT_ID).toBe("pan-zoom-follow-v1");
  });
});

describe("Fnv1a", () => {
  it("matches the reference value for 'a' and depends on content", () => {
    expect(new Fnv1a().updateString("a").hex()).toBe("e40c292c");
    expect(new Fnv1a().updateArray(new Float32Array([1])).hex()).not.toBe(new Fnv1a().updateArray(new Float32Array([2])).hex());
  });
});

describe("runRenderer fairness (invariant 9)", () => {
  it("feeds two renderers byte-identical data and steps", async () => {
    const script = makeScript({ frames: 24, startMs: 0, points: 1000, stepMs: 1, ingestHz: 1000 });
    const data = makeDataset({ seed: 3, series: 2, points: 1000 + totalAppend(script), startMs: 0, stepMs: 1 });
    const recA: string[] = [];
    const recB: string[] = [];
    const opts = { seriesIds: ["s0", "s1"], warmupFrames: 3 };
    const a = await runRenderer(fakeChart(recA), data, 1000, script, { ...opts, raf: fakeRaf(5) });
    const b = await runRenderer(fakeChart(recB), data, 1000, script, { ...opts, raf: fakeRaf(7) });
    expect(a.inputHash).toBe(b.inputHash);
    expect(recA).toEqual(recB);
    expect(a.frameMs.n).toBe(script.length);
    expect(a.frameMs.p50).toBe(5);
    expect(b.frameMs.p95).toBe(7);
    expect(a.gpuMs?.p50).toBe(0.5);
    expect(a.uploadBytes).toBe(8 * script.length);
  });

  it("changes the hash when the data differs", async () => {
    const script = makeScript({ frames: 8, startMs: 0, points: 100, stepMs: 1, ingestHz: 1000 });
    const d1 = makeDataset({ seed: 1, series: 2, points: 200, startMs: 0, stepMs: 1 });
    const d2 = makeDataset({ seed: 2, series: 2, points: 200, startMs: 0, stepMs: 1 });
    const opts = { seriesIds: ["s0", "s1"], warmupFrames: 0, raf: fakeRaf(1) };
    const a = await runRenderer(fakeChart([]), d1, 100, script, opts);
    const b = await runRenderer(fakeChart([]), d2, 100, script, opts);
    expect(a.inputHash).not.toBe(b.inputHash);
  });

  it("aborts when the tab is hidden", async () => {
    const script = makeScript({ frames: 8, startMs: 0, points: 100, stepMs: 1, ingestHz: 1000 });
    const data = makeDataset({ seed: 1, series: 2, points: 200, startMs: 0, stepMs: 1 });
    const run = runRenderer(fakeChart([]), data, 100, script, {
      seriesIds: ["s0", "s1"],
      warmupFrames: 0,
      raf: fakeRaf(1),
      isVisible: () => false,
    });
    await expect(run).rejects.toThrow(/hidden/);
  });
});
