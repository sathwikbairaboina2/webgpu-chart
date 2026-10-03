import { expect, test } from "@playwright/test";

test("demo: the WebGPU pane runs and reports CPU and GPU time", async ({ page }) => {
  await page.goto("/?points=100000&series=4");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await expect(page.getByTestId("banner")).toBeHidden();
  await expect(page.getByTestId("stats-webgpu")).toContainText("GPU", { timeout: 10_000 });
  await expect(page.getByTestId("fps")).toHaveText(/^\d+$/);
});
