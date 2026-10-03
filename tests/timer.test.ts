import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GpuTimer } from "../src/gpu/timer";

// A fake device whose readback buffers resolve when the test says so, holding a begin/end tick pair.
function fake() {
  const reads: { release: () => void; ticks: [bigint, bigint] }[] = [];
  const resolves: string[] = [];
  const device = {
    createQuerySet: () => ({ destroy() {} }),
    createBuffer: ({ usage }: { usage: number }) => {
      const buf = {
        ticks: [0n, 0n] as [bigint, bigint],
        destroy() {},
        unmap() {},
        getMappedRange() {
          return new BigUint64Array(buf.ticks).buffer;
        },
        mapAsync() {
          return new Promise<void>((res) => reads.push({ release: res, get ticks() { return buf.ticks; }, set ticks(v) { buf.ticks = v; } } as never));
        },
        usage,
      };
      return buf;
    },
  } as unknown as GPUDevice;
  const enc = {
    resolveQuerySet: (_q: unknown, first: number, count: number) => resolves.push(`resolve ${first} ${count}`),
    copyBufferToBuffer: () => undefined,
  } as unknown as GPUCommandEncoder;
  return { device, enc, reads, resolves };
}

beforeEach(() => {
  vi.stubGlobal("GPUBufferUsage", { QUERY_RESOLVE: 1, COPY_SRC: 2, MAP_READ: 4, COPY_DST: 8 });
  vi.stubGlobal("GPUMapMode", { READ: 1 });
});
afterEach(() => vi.unstubAllGlobals());

describe("GpuTimer ring", () => {
  it("times every frame while slots are free and drains all readings", async () => {
    const f = fake();
    const t = new GpuTimer(f.device, 4);
    for (let i = 0; i < 4; i++) {
      expect(t.begin()).toBeDefined();
      t.resolve(f.enc);
      t.collect();
    }
    expect(f.reads).toHaveLength(4);
    f.reads.forEach((r, i) => {
      r.ticks = [0n, BigInt(1_000_000 * (i + 1))];
      r.release();
    });
    const all = await t.drain();
    expect(all).toEqual([1, 2, 3, 4]);
    expect(await t.drain()).toEqual([]);
    expect(f.resolves).toEqual(["resolve 0 2", "resolve 2 2", "resolve 4 2", "resolve 6 2"]);
  });

  it("skips a frame when every slot is still being read back", () => {
    const f = fake();
    const t = new GpuTimer(f.device, 2);
    for (let i = 0; i < 2; i++) {
      t.begin();
      t.resolve(f.enc);
      t.collect();
    }
    expect(t.begin()).toBeUndefined();
    t.resolve(f.enc);
    t.collect();
    expect(f.reads).toHaveLength(2);
  });

  it("take returns the newest reading once", async () => {
    const f = fake();
    const t = new GpuTimer(f.device, 2);
    t.begin();
    t.resolve(f.enc);
    t.collect();
    f.reads[0].ticks = [10n, 2_000_010n];
    f.reads[0].release();
    await t.drain();
    expect(t.take()).toBe(2);
    expect(t.take()).toBeNull();
  });
});
