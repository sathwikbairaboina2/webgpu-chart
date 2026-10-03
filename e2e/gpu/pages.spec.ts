import { expect, test } from "@playwright/test";

test("demo: the WebGPU pane runs and reports CPU and GPU time", async ({ page }) => {
  await page.goto("/?points=100000&series=4");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await expect(page.getByTestId("banner")).toBeHidden();
  await expect(page.getByTestId("stats-webgpu")).toContainText("GPU", { timeout: 10_000 });
  await expect(page.getByTestId("fps")).toHaveText(/^\d+$/);
});

test("bench page: all renderers finish with identical input hashes (invariant 9)", async ({ page }) => {
  await page.goto("/bench.html?name=smoke&points=20000&series=2&frames=12&warmup=2");
  await page.waitForFunction(() => window.__bench?.done === true, null, { timeout: 90_000 });
  const out = await page.evaluate(() => window.__bench!);
  expect(out.error).toBeUndefined();
  const results = Object.values(out.result!.scenario.results);
  expect(results).toHaveLength(3);
  const hashes = results.map((r) => ("error" in r ? r.error : r.inputHash));
  expect(new Set(hashes).size).toBe(1);
  expect(hashes[0]).toMatch(/^[0-9a-f]{8}$/);
});
