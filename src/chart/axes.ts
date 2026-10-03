import { formatTime, formatValue, niceTicks, timeTicks } from "../core/ticks";
import { yToPx } from "../core/segments";
import type { Viewport } from "../core/viewport";
import type { Theme } from "./theme";

/** Plot area inside the chart root, CSS px. */
export interface PlotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Space around the plot for tick labels, CSS px. */
export const MARGINS = { left: 56, right: 8, top: 8, bottom: 24 };

export interface AxisTick {
  /** CSS px from the chart root's left (x ticks) or top (y ticks). */
  px: number;
  label: string;
}

export interface AxesLayout {
  x: AxisTick[];
  y: AxisTick[];
}

export interface AxesOptions {
  tzOffsetMs: number;
  utc: boolean;
}

export function layoutAxes(view: Viewport, yRange: [number, number], plot: PlotRect, opts: AxesOptions): AxesLayout {
  const span = view.t1 - view.t0 || 1;
  const xt = timeTicks(view.t0, view.t1, Math.max(2, Math.floor(plot.width / 110)), opts.tzOffsetMs);
  const x = xt.ticks.map((t) => ({
    px: plot.left + ((t - view.t0) / span) * plot.width,
    label: formatTime(t, xt.step, opts.utc),
  }));
  const ys = niceTicks(yRange[0], yRange[1], Math.max(2, Math.floor(plot.height / 50)));
  const yStep = ys.length > 1 ? ys[1] - ys[0] : 1;
  const map = { yMin: yRange[0], yMax: yRange[1], heightPx: plot.height };
  const y = ys.map((v) => ({ px: plot.top + yToPx(v, map), label: formatValue(v, yStep) }));
  return { x, y };
}

/** Changes only when a redraw would look different. */
export function axesKey(l: AxesLayout): string {
  const part = (t: AxisTick) => `${Math.round(t.px * 2)}:${t.label}`;
  return `${l.x.map(part).join(",")}|${l.y.map(part).join(",")}`;
}

/** Draws grid lines and labels on the overlay canvas (sized in device px, drawn in CSS px). */
export function drawAxes(
  ctx: CanvasRenderingContext2D,
  l: AxesLayout,
  plot: PlotRect,
  size: { width: number; height: number },
  theme: Theme,
  dpr: number,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const t of l.x) {
    const x = Math.round(t.px) + 0.5;
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plot.height);
  }
  for (const t of l.y) {
    const y = Math.round(t.px) + 0.5;
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.left + plot.width, y);
  }
  ctx.stroke();
  ctx.fillStyle = theme.axisText;
  ctx.font = theme.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const t of l.x) ctx.fillText(t.label, t.px, plot.top + plot.height + 6);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const t of l.y) ctx.fillText(t.label, plot.left - 8, t.px);
}
