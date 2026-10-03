import { describe, expect, it } from "vitest";
import { Canvas2DBackend, type Canvas2DLike, type Ctx2D } from "../src/baselines/canvas2d";
import { Ring } from "../src/core/ring";
import { createBuckets, decimate, makeParams } from "../src/core/decimate";
import { segmentsFromBuckets } from "../src/core/segments";

function fakeCanvas() {
  const calls: string[] = [];
  const ctx: Ctx2D = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    fillRect: (x, y, w, h) => calls.push(`fillRect ${x} ${y} ${w} ${h}`),
    beginPath: () => calls.push("beginPath"),
    moveTo: (x, y) => calls.push(`moveTo ${x} ${y}`),
    lineTo: (x, y) => calls.push(`lineTo ${x} ${y}`),
    stroke: () => calls.push(`stroke ${String(ctx.strokeStyle)}`),
  };
  const canvas: Canvas2DLike = { width: 0, height: 0, getContext: () => ctx };
  return { canvas, ctx, calls };
}

describe("Canvas2DBackend", () => {
  it("strokes exactly the CPU segments for each series", () => {
    const { canvas, calls } = fakeCanvas();
    const be = new Canvas2DBackend(canvas, "#000000");
    const ring = new Ring(64);
    const ts = Array.from({ length: 40 }, (_, i) => i);
    ring.append(ts, ts.map((v) => Math.sin(v)));
    be.addSeries(ring, "#ff0000");
    be.resize(20, 10);
    expect([canvas.width, canvas.height]).toEqual([20, 10]);
    const frame = { view: { t0: 0, t1: 39 }, yRange: [-1, 1] as [number, number], lineWidthPx: 1, maxGapPx: 32 };
    const stats = be.render(frame);
    expect(stats).toEqual({ uploadBytes: 0, visiblePoints: 40, gpuMs: null });

    const b = decimate(ring, makeParams(ring, frame.view, 20), createBuckets(20));
    const segs = segmentsFromBuckets(b, { yMin: -1, yMax: 1, heightPx: 10 }, 32);
    const moves = calls.filter((c) => c.startsWith("moveTo"));
    expect(moves).toHaveLength(segs.length / 4);
    expect(moves[0]).toBe(`moveTo ${segs[0]} ${segs[1]}`);
    expect(calls[0]).toBe("fillRect 0 0 20 10");
    expect(calls.at(-1)).toBe("stroke #ff0000");
  });

  it("throws when the context is unavailable", () => {
    expect(() => new Canvas2DBackend({ width: 1, height: 1, getContext: () => null }, "#000")).toThrow(/unavailable/);
  });
});
