import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/gpu-test.html");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
});

test("GPU decimation is byte-identical to the CPU reference (invariant 1)", async ({ page }) => {
  const r = await page.evaluate(() => window.__gpuTest.parity(20261004, 200));
  expect(r.firstMismatch).toBeNull();
  expect(r.mismatches).toBe(0);
  expect(r.cases).toBe(200);
  expect(r.wrapped).toBeGreaterThan(20);
  expect(r.emptyWindows).toBeGreaterThan(5);
});
