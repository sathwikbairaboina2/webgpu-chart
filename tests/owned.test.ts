import { describe, expect, it } from "vitest";
import { buildOwned } from "../src/gpu/owned";

function fakes() {
  const calls: string[] = [];
  return { calls, device: { destroy: () => calls.push("device") }, chart: { destroy: () => calls.push("chart") } };
}

describe("buildOwned", () => {
  it("destroys the chart, then the device, once", async () => {
    const f = fakes();
    const o = await buildOwned(f.device, async () => f.chart);
    expect(f.calls).toEqual([]);
    o.release();
    o.release();
    expect(f.calls).toEqual(["chart", "device"]);
  });

  it("destroys the device when the build fails and rethrows", async () => {
    const f = fakes();
    await expect(buildOwned(f.device, async () => Promise.reject(new Error("no webgpu context")))).rejects.toThrow(/no webgpu/);
    expect(f.calls).toEqual(["device"]);
  });

  it("still destroys the device when chart.destroy throws", async () => {
    const f = fakes();
    const o = await buildOwned(f.device, async () => ({
      destroy: () => {
        throw new Error("boom");
      },
    }));
    expect(() => o.release()).toThrow(/boom/);
    expect(f.calls).toEqual(["device"]);
  });
});
