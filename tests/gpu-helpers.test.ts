import { describe, expect, it, vi } from "vitest";
import { acquireDevice, type GpuNavigator } from "../src/gpu/device";
import { isSupported } from "../src/gpu/support";
import { DRAW_BYTES, VIEW_BYTES, packDraw, packView, parseColor } from "../src/gpu/uniforms";

function fakeNav(opts: { adapter?: "none" | "throws" | "ok"; timestamp?: boolean } = {}) {
  const requestDevice = vi.fn(async (_d?: GPUDeviceDescriptor) => ({}) as GPUDevice);
  const adapter = {
    features: new Set(opts.timestamp ? ["timestamp-query"] : []),
    limits: { maxStorageBufferBindingSize: 1 << 30, maxBufferSize: 1 << 30 },
    info: { vendor: "acme", architecture: "rdna9", description: "" },
    requestDevice,
  };
  const nav: GpuNavigator = {
    gpu: {
      requestAdapter: vi.fn(async () => {
        if (opts.adapter === "throws") throw new Error("boom");
        return opts.adapter === "none" ? null : (adapter as unknown as GPUAdapter);
      }),
    },
  };
  return { nav, requestDevice };
}

describe("isSupported", () => {
  it("explains each failure", async () => {
    expect((await isSupported({})).reason).toMatch(/navigator\.gpu is missing/);
    expect((await isSupported(fakeNav({ adapter: "none" }).nav)).reason).toMatch(/no GPU adapter/);
    expect((await isSupported(fakeNav({ adapter: "throws" }).nav)).reason).toMatch(/requestAdapter failed: boom/);
    expect(await isSupported(fakeNav({ adapter: "ok" }).nav)).toEqual({ ok: true });
  });
});

describe("acquireDevice", () => {
  it("asks for timestamp-query only when wanted and available", async () => {
    const a = fakeNav({ adapter: "ok", timestamp: true });
    const got = await acquireDevice(a.nav, { timestamps: true });
    expect(got.timestamps).toBe(true);
    expect(a.requestDevice.mock.calls[0][0]?.requiredFeatures).toEqual(["timestamp-query"]);
    expect(got.adapter).toEqual({ vendor: "acme", architecture: "rdna9", description: "" });

    const b = fakeNav({ adapter: "ok", timestamp: false });
    expect((await acquireDevice(b.nav, { timestamps: true })).timestamps).toBe(false);
    expect(b.requestDevice.mock.calls[0][0]?.requiredFeatures).toEqual([]);
  });

  it("throws a readable error without an adapter", async () => {
    await expect(acquireDevice(fakeNav({ adapter: "none" }).nav)).rejects.toThrow(/no GPU adapter/);
  });
});

describe("uniform packing", () => {
  it("packs View in the WGSL layout", () => {
    const buf = packView({ t0: 1.5, scale: 0.25, width: 1600, start: 3, end: 99 }, 7, 1000);
    expect(buf.byteLength).toBe(VIEW_BYTES);
    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);
    expect([f[0], f[1]]).toEqual([1.5, 0.25]);
    expect(Array.from(u.slice(2))).toEqual([1600, 7, 1000, 3, 99, 0]);
  });

  it("packs Draw in the WGSL layout", () => {
    const buf = packDraw({ widthPx: 800, heightPx: 600, yMin: -1, yMax: 1, lineWidthPx: 1, maxGapPx: 32, color: [1, 0.5, 0, 1] });
    expect(buf.byteLength).toBe(DRAW_BYTES);
    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);
    expect(Array.from(f.slice(0, 5))).toEqual([800, 600, -1, 1, 1]);
    expect(u[5]).toBe(32);
    expect(Array.from(f.slice(8))).toEqual([1, 0.5, 0, 1]);
  });

  it("parses hex colors", () => {
    expect(parseColor("#ff0000")).toEqual([1, 0, 0, 1]);
    expect(parseColor("#fff")).toEqual([1, 1, 1, 1]);
    expect(parseColor("#00000080")[3]).toBeCloseTo(0.502, 3);
    expect(() => parseColor("red")).toThrow(/unsupported color/);
  });
});
