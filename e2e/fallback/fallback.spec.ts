import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page): Promise<void> {
  await page.goto("/?points=100000&series=4");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
}

test("navigator.gpu missing: the page says why and runs the baselines", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "gpu", { get: () => undefined }));
  await ready(page);
  await expect(page.getByTestId("banner")).toContainText("navigator.gpu is missing");
  await expect(page.getByTestId("pane-webgpu")).toContainText("WebGPU unavailable");
  await expect(page.getByTestId("pane-canvas2d").getByRole("button")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("stats-canvas2d")).toContainText("CPU", { timeout: 10_000 });
  await expect(page.locator(".uplot")).toHaveCount(1);
});

test("no adapter: the page says why", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, "gpu", {
      get: () => ({ requestAdapter: async () => null, getPreferredCanvasFormat: () => "bgra8unorm" }),
    }),
  );
  await ready(page);
  await expect(page.getByTestId("banner")).toContainText("no GPU adapter");
  await expect(page.getByTestId("pane-canvas2d").getByRole("button")).toHaveAttribute("aria-pressed", "true");
});
