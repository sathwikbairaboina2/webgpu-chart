/** 1, 2 or 5 times a power of ten, at least span / maxTicks. */
export function niceStep(span: number, maxTicks: number): number {
  const raw = span / Math.max(1, maxTicks);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

/** Evenly spaced round values in [min, max]. */
export function niceTicks(min: number, max: number, maxTicks = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (!(max > min)) return [min];
  const step = niceStep(max - min, maxTicks);
  const first = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const v = first + i * step;
    if (v > max + step * 1e-9) break;
    out.push(Number(v.toPrecision(12)));
  }
  return out;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Allowed time steps in ms. */
export const TIME_STEPS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500,
  SECOND, 2 * SECOND, 5 * SECOND, 10 * SECOND, 15 * SECOND, 30 * SECOND,
  MINUTE, 2 * MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE,
  HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY,
];

export function timeStep(spanMs: number, maxTicks: number): number {
  const raw = spanMs / Math.max(1, maxTicks);
  for (const s of TIME_STEPS) if (s >= raw) return s;
  return niceStep(spanMs / DAY, maxTicks) * DAY;
}

/**
 * Time ticks in [t0, t1] (absolute ms). `tzOffsetMs` is added before aligning, so hour ticks fall on local
 * hours (pass -new Date().getTimezoneOffset() * 60000 for local time, 0 for UTC).
 */
export function timeTicks(t0: number, t1: number, maxTicks = 8, tzOffsetMs = 0): { step: number; ticks: number[] } {
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return { step: 1, ticks: [] };
  if (!(t1 > t0)) return { step: 1, ticks: [t0] };
  const step = timeStep(t1 - t0, maxTicks);
  const first = Math.ceil((t0 + tzOffsetMs) / step) * step - tzOffsetMs;
  const ticks: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const v = first + i * step;
    if (v > t1) break;
    ticks.push(v);
  }
  return { step, ticks };
}

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");

/** Label for a time tick. Finer steps show finer units. */
export function formatTime(t: number, step: number, utc = false): string {
  const d = new Date(t);
  const Y = utc ? d.getUTCFullYear() : d.getFullYear();
  const M = (utc ? d.getUTCMonth() : d.getMonth()) + 1;
  const D = utc ? d.getUTCDate() : d.getDate();
  const h = utc ? d.getUTCHours() : d.getHours();
  const m = utc ? d.getUTCMinutes() : d.getMinutes();
  const s = utc ? d.getUTCSeconds() : d.getSeconds();
  const ms = utc ? d.getUTCMilliseconds() : d.getMilliseconds();
  if (step >= DAY) return `${Y}-${pad(M)}-${pad(D)}`;
  if (step >= MINUTE) return `${pad(h)}:${pad(m)}`;
  if (step >= SECOND) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

/** Label for a value tick with just enough decimals for the step. */
export function formatValue(v: number, step: number): string {
  const decimals = Math.min(10, Math.max(0, -Math.floor(Math.log10(step))));
  return v.toFixed(decimals);
}
