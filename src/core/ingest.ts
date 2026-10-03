/** What to do with a sample whose t is before the last accepted t. */
export type OrderPolicy = "drop" | "clamp-to-last";

export interface IngestReport {
  accepted: number;
  droppedNonFinite: number;
  droppedOutOfOrder: number;
  clamped: number;
}

export interface ValidatedBatch {
  t: Float64Array;
  y: Float32Array;
  report: IngestReport;
}

/**
 * Filters a batch so it can go into a Ring (invariant 5).
 * Non-finite t, non-finite y and y that overflow f32 are always dropped.
 * Out-of-order t (before `lastT`) is dropped or clamped to the last accepted t, per `policy`.
 */
export function validateBatch(
  t: ArrayLike<number>,
  y: ArrayLike<number>,
  lastT: number,
  policy: OrderPolicy = "drop",
): ValidatedBatch {
  if (t.length !== y.length) throw new RangeError(`t has ${t.length} samples but y has ${y.length}`);
  const outT = new Float64Array(t.length);
  const outY = new Float32Array(t.length);
  let n = 0;
  let nonFinite = 0;
  let outOfOrder = 0;
  let clamped = 0;
  let last = lastT;
  for (let i = 0; i < t.length; i++) {
    let ti = t[i];
    const yi = y[i];
    if (!Number.isFinite(ti) || !Number.isFinite(Math.fround(yi))) {
      nonFinite++;
      continue;
    }
    if (ti < last) {
      if (policy === "drop") {
        outOfOrder++;
        continue;
      }
      ti = last;
      clamped++;
    }
    outT[n] = ti;
    outY[n] = yi;
    n++;
    last = ti;
  }
  return {
    t: outT.subarray(0, n),
    y: outY.subarray(0, n),
    report: { accepted: n, droppedNonFinite: nonFinite, droppedOutOfOrder: outOfOrder, clamped },
  };
}
