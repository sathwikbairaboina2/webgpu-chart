import type { DecimateParams } from "../core/decimate";

/** Bytes of `struct View` in decimate.wgsl. */
export const VIEW_BYTES = 32;
/** Bytes of `struct Draw` in segments.wgsl. */
export const DRAW_BYTES = 48;

export type Rgba = [number, number, number, number];

/**
 * struct View { t0: f32, scale: f32, width: u32, oldest: u32, capacity: u32, start: u32, end: u32, _pad: u32 }
 */
export function packView(p: DecimateParams, oldest: number, capacity: number, out = new ArrayBuffer(VIEW_BYTES)): ArrayBuffer {
  const f = new Float32Array(out, 0, 8);
  const u = new Uint32Array(out, 0, 8);
  f[0] = p.t0;
  f[1] = p.scale;
  u[2] = p.width;
  u[3] = oldest;
  u[4] = capacity;
  u[5] = p.start;
  u[6] = p.end;
  u[7] = 0;
  return out;
}

export interface DrawParams {
  widthPx: number;
  heightPx: number;
  yMin: number;
  yMax: number;
  lineWidthPx: number;
  maxGapPx: number;
  color: Rgba;
}

/**
 * struct Draw { size: vec2f, yRange: vec2f, lineWidth: f32, maxGap: u32, _pad: vec2u, color: vec4f }
 * Offsets: size 0, yRange 8, lineWidth 16, maxGap 20, _pad 24, color 32. Total 48.
 */
export function packDraw(d: DrawParams, out = new ArrayBuffer(DRAW_BYTES)): ArrayBuffer {
  const f = new Float32Array(out, 0, 12);
  const u = new Uint32Array(out, 0, 12);
  f[0] = d.widthPx;
  f[1] = d.heightPx;
  f[2] = d.yMin;
  f[3] = d.yMax;
  f[4] = d.lineWidthPx;
  u[5] = d.maxGapPx;
  u[6] = 0;
  u[7] = 0;
  f[8] = d.color[0];
  f[9] = d.color[1];
  f[10] = d.color[2];
  f[11] = d.color[3];
  return out;
}

/** "#rgb", "#rrggbb" or "#rrggbbaa" to floats in [0, 1]. */
export function parseColor(hex: string): Rgba {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) throw new Error(`unsupported color "${hex}", use #rgb, #rrggbb or #rrggbbaa`);
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 6) h += "ff";
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return [n(0), n(2), n(4), n(6)];
}
