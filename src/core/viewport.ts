/** Visible time window, absolute ms. */
export interface Viewport {
  t0: number;
  t1: number;
}

/** Data time range, absolute ms. */
export interface Bounds {
  min: number;
  max: number;
}

/** Smallest span a user can zoom to. */
export const MIN_VIEW_SPAN_MS = 1;

/** Keeps the span in [minSpan, data span] and the window inside the data. */
export function clampView(v: Viewport, b: Bounds, minSpan = MIN_VIEW_SPAN_MS): Viewport {
  const full = Math.max(b.max - b.min, minSpan);
  const wanted = v.t1 - v.t0;
  const span = Math.min(Math.max(Number.isFinite(wanted) ? wanted : full, minSpan), full);
  let t0 = Number.isFinite(v.t0) ? v.t0 : b.min;
  if (t0 + span > b.min + full) t0 = b.min + full - span;
  if (t0 < b.min) t0 = b.min;
  return { t0, t1: t0 + span };
}

/** Zooms around `anchor` (absolute ms). factor > 1 zooms out, factor < 1 zooms in. */
export function zoomAt(v: Viewport, anchor: number, factor: number, b: Bounds, minSpan = MIN_VIEW_SPAN_MS): Viewport {
  const f = Math.max(factor, 1e-6);
  return clampView({ t0: anchor - (anchor - v.t0) * f, t1: anchor + (v.t1 - anchor) * f }, b, minSpan);
}

export function panBy(v: Viewport, deltaMs: number, b: Bounds, minSpan = MIN_VIEW_SPAN_MS): Viewport {
  return clampView({ t0: v.t0 + deltaMs, t1: v.t1 + deltaMs }, b, minSpan);
}

/** Window that ends at the newest sample. */
export function followView(latest: number, windowMs: number): Viewport {
  return { t0: latest - windowMs, t1: latest };
}

export function pxToTime(px: number, widthPx: number, v: Viewport): number {
  return v.t0 + (px / widthPx) * (v.t1 - v.t0);
}
