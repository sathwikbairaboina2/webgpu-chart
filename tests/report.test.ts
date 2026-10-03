import { describe, expect, it } from "vitest";
import { applyToReadme, gpuCell, hardwareLine, MIN_GPU_SAMPLES, renderHeadline, renderTable, type BenchFile, type RendererResult } from "../src/bench/report";

// Fixture values for formatting tests only. They are not measurements.
const sum = (p95: number, n = 600) => ({ n, p50: p95 / 2, p95, p99: p95 * 1.5, mean: p95 / 2, max: p95 * 2, over16ms: p95 > 16 ? 300 : 0 });
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
        webgpu: { frameMs: sum(1), completeMs: sum(2), throughputMs: 1.5, gpuMs: sum(0.5), inputHash: "aaaaaaaa", uploadBytes: 1 },
        canvas2d: { frameMs: sum(40), completeMs: sum(40), throughputMs: 20, gpuMs: null, inputHash: "aaaaaaaa", uploadBytes: 0 },
        uplot: { error: "fixture failure" },
      },
    },
  ],
};

describe("bench report", () => {
  it("builds the headline from the 4x1M scenario", () => {
    expect(renderHeadline(fixture)).toBe(
      "**4 series x 1M points: p95 frame time to GPU-complete 2.00 ms on WebGPU vs n/a on uPlot and 40.00 ms on Canvas2D** " +
        "(one frame in flight, each frame timed until its GPU work finished, Fixture GPU, Fixture CPU, Chrome 999, measured 2000-01-01).",
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
    expect(t[2]).toBe("| 4x1M | WebGPU | 1.00 | 2.00 | 3.00 | 0 / 600 | 1.50 | 0.50 (n=600) |");
    expect(t[3]).toBe("| 4x1M | uPlot | error: fixture failure | | | | | |");
    expect(t[4]).toBe("| 4x1M | Canvas2D | 20.00 | 40.00 | 60.00 | 300 / 600 | 20.00 | n/a |");
  });

  it("marks GPU summaries with too few samples instead of quoting a percentile", () => {
    expect(gpuCell(sum(15.07, 2))).toBe("n/a (only 2 samples)");
    expect(gpuCell(sum(0.5, MIN_GPU_SAMPLES))).toBe("0.50 (n=30)");
    expect(gpuCell(null)).toBe("n/a");
    const low: BenchFile = {
      ...fixture,
      scenarios: [{ ...fixture.scenarios[0], results: { webgpu: { ...(fixture.scenarios[0].results.webgpu as RendererResult), gpuMs: sum(15.07, 3) } } }],
    };
    expect(renderTable(low)).toContain("n/a (only 3 samples)");
    expect(renderTable(low)).not.toContain("15.07");
  });

  it("replaces only the marked regions and is stable", () => {
    const readme = "# x\n<!-- headline:start -->\nold\n<!-- headline:end -->\ntext\n<!-- bench:start -->\nold\n<!-- bench:end -->\n";
    const once = applyToReadme(readme, fixture);
    expect(once).toContain("text");
    expect(once).not.toContain("old");
    expect(applyToReadme(once, fixture)).toBe(once);
    expect(() => applyToReadme("# none", fixture)).toThrow(/markers/);
    // DEVDOCS carries the headline only.
    const dev = applyToReadme("<!-- headline:start -->\nold\n<!-- headline:end -->\n", fixture);
    expect(dev).toContain("GPU-complete");
    expect(dev).not.toContain("| Scenario");
  });
});
