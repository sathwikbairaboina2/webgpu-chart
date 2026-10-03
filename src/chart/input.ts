import type { PlotRect } from "./axes";
import type { ChartModel } from "./model";

/** Wheel zoom factor per wheel delta unit. */
export const WHEEL_ZOOM_RATE = 0.0015;

/**
 * Drag to pan, wheel to zoom at the cursor, double-click to return to follow mode.
 * Returns a function that removes the listeners.
 */
export function attachInput(el: HTMLElement, model: ChartModel, plot: () => PlotRect): () => void {
  let dragX: number | null = null;
  const onDown = (e: PointerEvent) => {
    dragX = e.clientX;
    el.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (dragX === null) return;
    const dx = e.clientX - dragX;
    dragX = e.clientX;
    if (dx !== 0) model.panPx(dx, plot().width);
  };
  const onUp = (e: PointerEvent) => {
    dragX = null;
    el.releasePointerCapture?.(e.pointerId);
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const p = plot();
    const px = Math.min(Math.max(e.clientX - r.left - p.left, 0), p.width);
    model.zoomAtPx(px, p.width, Math.exp(e.deltaY * WHEEL_ZOOM_RATE));
  };
  const onDbl = () => model.setViewport("follow");
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("dblclick", onDbl);
  return () => {
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("dblclick", onDbl);
  };
}
