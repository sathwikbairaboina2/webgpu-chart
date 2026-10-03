import { describe, expect, it } from "vitest";
import { Ring } from "../src/core/ring";
import { uploadDirty, type QueueLike } from "../src/gpu/upload";

function recorder() {
  const calls: { offset: number; dataOffset: number; size: number }[] = [];
  const queue: QueueLike = {
    writeBuffer: (_b, offset, _d, dataOffset, size) => calls.push({ offset, dataOffset, size }),
  };
  return { queue, calls };
}

const buffer = {} as GPUBuffer;
const batch = (from: number, k: number) => Array.from({ length: k }, (_, i) => from + i);

describe("uploadDirty (invariant 7)", () => {
  it("uploads new samples x 8 bytes per frame in steady state, including across the wrap", () => {
    const ring = new Ring(1000);
    const { queue, calls } = recorder();
    const first = batch(0, 600);
    ring.append(first, first);
    expect(uploadDirty(queue, buffer, ring)).toBe(600 * 8);
    let t = 600;
    for (let frame = 0; frame < 200; frame++) {
      const ts = batch(t, 16);
      t += 16;
      ring.append(ts, ts);
      expect(uploadDirty(queue, buffer, ring)).toBe(16 * 8);
    }
    expect(calls.some((c) => c.offset === 0 && c.size < 32)).toBe(true);
  });

  it("uploads nothing when nothing changed", () => {
    const ring = new Ring(10);
    const { queue, calls } = recorder();
    expect(uploadDirty(queue, buffer, ring)).toBe(0);
    expect(calls).toEqual([]);
  });

  it("writes byte offsets for the buffer and element offsets for the data", () => {
    const ring = new Ring(10);
    const { queue, calls } = recorder();
    ring.append([0, 1, 2], [0, 0, 0]);
    uploadDirty(queue, buffer, ring);
    ring.append([3, 4], [0, 0]);
    uploadDirty(queue, buffer, ring);
    expect(calls[1]).toEqual({ offset: 24, dataOffset: 6, size: 4 });
  });

  it("uploads the whole ring once after a batch larger than capacity", () => {
    const ring = new Ring(100);
    const { queue } = recorder();
    const big = batch(0, 250);
    ring.append(big, big);
    expect(uploadDirty(queue, buffer, ring)).toBe(100 * 8);
  });
});
