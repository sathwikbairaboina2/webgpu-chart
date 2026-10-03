import { describe, expect, it } from "vitest";
import { applyToReadme, hardwareLine, renderHeadline, renderTable, type BenchFile } from "../src/bench/report";

// Fixture values for formatting tests only. They are not measurements.
const sum = (p95: number) => ({ n: 600, p50: p95 / 2, p95, p99: p95 * 1.5, mean: p95 / 2, max: p95 * 2, over16ms: p95 > 16 ? 300 : 0 });
const fixture: BenchFile = {
  schema: 1,
  date: "2000-01-01",
  env: {
    ua: "Mozilla/5.0 Chrome/999.0.0.0 Safari/537.36",
    adapter: { vendor: "fixturevendor", architecture: "fixturearch", description: "" },
    gpuNames: ["Fixture GPU"],
    cpu: "Fixture CPU",
    os: "fixture-os",
    dpr: 1,
    canvas: [1600, 600],
    crossOriginIsolated: true,
    chromeArgs: [],
  },
  scenarios: [
    {
      name: "4x1M",
      spec: { points: 1_000_000, series: 4, frames: 600, warmup: 60, ingestHz: 1000, seed: 42, script: "pan-zoom-follow-v1" },
      results: {
        webgpu: { frameMs: sum(1), gpuMs: sum(0.5), inputHash: "aaaaaaaa", uploadBytes: 1 },
        canvas2d: { frameMs: sum(40), gpuMs: null, inputHash: "aaaaaaaa", uploadBytes: 0 },
        uplot: { error: "fixture failure" },
      },
    },
  ],
};

describe("bench report", () => {
  it("builds the headline from the 4x1M scenario", () => {
    expect(renderHeadline(fixture)).toBe(
      "**4 series x 1M points: p95 frame time 1.00 ms on WebGPU vs n/a on uPlot and 40.00 ms on Canvas2D** " +
        "(uncapped rAF, Fixture GPU, Fixture CPU, Chrome 999, measured 2000-01-01).",
    );
    expect(() => renderHeadline({ ...fixture, scenarios: [] })).toThrow(/4x1M/);
  });

  it("picks the OS GPU name that matches the adapter vendor", () => {
    expect(hardwareLine({ ...fixture.env, gpuNames: ["Other iGPU", "FixtureVendor Big GPU"] })).toBe("FixtureVendor Big GPU, Fixture CPU, Chrome 999");
  });

  it("falls back to the adapter name when the OS gave no GPU name", () => {
    expect(hardwareLine({ ...fixture.env, gpuNames: [] })).toBe("fixturevendor fixturearch, Fixture CPU, Chrome 999");
  });

  it("renders one row per renderer, errors included", () => {
    const t = renderTable(fixture).split("\n");
    expect(t[2]).toBe("| 4x1M | WebGPU | 0.50 | 1.00 | 1.50 | 0 / 600 | 0.50 |");
    expect(t[3]).toBe("| 4x1M | uPlot | error: fixture failure | | | | |");
    expect(t[4]).toBe("| 4x1M | Canvas2D | 20.00 | 40.00 | 60.00 | 300 / 600 | n/a |");
  });

  it("replaces only the marked regions and is stable", () => {
    const readme = "# x\n<!-- headline:start -->\nold\n<!-- headline:end -->\ntext\n<!-- bench:start -->\nold\n<!-- bench:end -->\n";
    const once = applyToReadme(readme, fixture);
    expect(once).toContain("text");
    expect(once).not.toContain("old");
    expect(applyToReadme(once, fixture)).toBe(once);
    expect(() => applyToReadme("# none", fixture)).toThrow(/markers/);
  });
});
