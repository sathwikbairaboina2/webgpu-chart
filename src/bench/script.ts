/** Version tag of the interaction script, stored in every result. */
export const SCRIPT_ID = "pan-zoom-follow-v1";

export type Step =
  | { kind: "view"; t0: number; t1: number }
  | { kind: "follow"; windowMs: number; append: number };

export interface ScriptSpec {
  /** Measured steps. */
  frames: number;
  startMs: number;
  /** Samples per series loaded before the first step. */
  points: number;
  stepMs: number;
  /** Samples per second per series appended during the follow phase. */
  ingestHz: number;
  /** Frame rate the ingest is spread over. Default 60. */
  nominalFps?: number;
}

/**
 * Four equal phases (ADR 0004): pan a quarter-span window across the data, zoom in 1000x around the middle,
 * zoom back out, then follow the newest data while appending ingestHz / nominalFps samples per step.
 */
export function makeScript(s: ScriptSpec): Step[] {
  const fps = s.nominalFps ?? 60;
  const a = s.startMs;
  const span = (s.points - 1) * s.stepMs;
  const win = span / 4;
  const mid = a + span / 2;
  const q = Math.floor(s.frames / 4);
  const frac = (i: number) => (q > 1 ? i / (q - 1) : 0);
  const steps: Step[] = [];
  for (let i = 0; i < q; i++) {
    const t0 = a + frac(i) * (span - win);
    steps.push({ kind: "view", t0, t1: t0 + win });
  }
  for (let i = 0; i < q; i++) {
    const w = span * Math.pow(1000, -frac(i));
    steps.push({ kind: "view", t0: mid - w / 2, t1: mid + w / 2 });
  }
  for (let i = 0; i < q; i++) {
    const w = span * Math.pow(1000, -(1 - frac(i)));
    steps.push({ kind: "view", t0: mid - w / 2, t1: mid + w / 2 });
  }
  for (let i = 0; i < s.frames - 3 * q; i++) {
    const append = Math.floor(((i + 1) * s.ingestHz) / fps) - Math.floor((i * s.ingestHz) / fps);
    steps.push({ kind: "follow", windowMs: win, append });
  }
  return steps;
}

/** Samples per series that the follow phase appends. */
export function totalAppend(steps: Step[]): number {
  let n = 0;
  for (const s of steps) if (s.kind === "follow") n += s.append;
  return n;
}
