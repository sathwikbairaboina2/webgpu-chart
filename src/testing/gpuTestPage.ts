// Test hooks for e2e/gpu/*.spec.ts. Loaded only by gpu-test.html; never part of the library.
import { decimate, makeParams } from "../core/decimate";
import { mulberry32 } from "../core/prng";
import { Ring } from "../core/ring";
import { acquireDevice, type AcquiredDevice } from "../gpu/device";
import { GpuDecimator } from "../gpu/decimator";

export interface ParityReport {
  cases: number;
  columns: number;
  mismatches: number;
  emptyWindows: number;
  wrapped: number;
  firstMismatch: string | null;
}

let acquired: Promise<AcquiredDevice> | null = null;
const device = () => (acquired ??= acquireDevice());

/** Seeded random rings (wrapped, duplicate t, gaps), random viewports and widths; GPU vs CPU byte comparison. */
async function parity(seed: number, cases: number): Promise<ParityReport> {
  const { device: dev } = await device();
  const dec = new GpuDecimator(dev);
  const rnd = mulberry32(seed);
  const report: ParityReport = { cases: 0, columns: 0, mismatches: 0, emptyWindows: 0, wrapped: 0, firstMismatch: null };
  for (let c = 0; c < cases; c++) {
    const capacity = 1 + Math.floor(rnd() * 20_000);
    const total = 1 + Math.floor(rnd() * capacity * 2);
    const ring = new Ring(capacity);
    let t = 1_759_536_000_000 + rnd() * 1e6;
    const ts = new Float64Array(total);
    const ys = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      const r = rnd();
      t += r < 0.3 ? 0 : r < 0.95 ? rnd() * 3 : rnd() * 500;
      ts[i] = t;
      ys[i] = (rnd() - 0.5) * 1e4;
    }
    // Append in chunks so the ring wraps and `oldest` moves away from slot 0.
    for (let i = 0; i < total; ) {
      const k = 1 + Math.floor(rnd() * Math.max(1, capacity / 3));
      ring.append(ts.subarray(i, i + k), ys.subarray(i, i + k));
      i += k;
    }
    if (ring.oldest !== 0) report.wrapped++;
    const width = 1 + Math.floor(rnd() * 2000);
    const first = ring.firstT();
    const last = ring.lastT();
    const mode = rnd();
    let view: { t0: number; t1: number };
    if (mode < 0.1) view = { t0: last + 10, t1: last + 1000 };
    else if (mode < 0.2) view = { t0: first + (last - first) / 2, t1: first + (last - first) / 2 };
    else {
      const a = first + rnd() * (last - first);
      const b = first + rnd() * (last - first);
      view = { t0: Math.min(a, b) - rnd() * 50, t1: Math.max(a, b) + rnd() * 50 };
    }
    const params = makeParams(ring, view, width);
    if (params.end === params.start) report.emptyWindows++;
    const cpu = new Uint32Array(decimate(ring, params).buffer);
    const s = dec.createSeries(ring, width);
    dec.prepare(s, view);
    const enc = dev.createCommandEncoder();
    const pass = enc.beginComputePass();
    dec.encode(pass, s);
    pass.end();
    dev.queue.submit([enc.finish()]);
    const gpu = new Uint32Array(await dec.readBuckets(s));
    dec.destroySeries(s);
    for (let col = 0; col < width; col++) {
      let same = true;
      for (let w = 0; w < 8; w++) if (gpu[col * 8 + w] !== cpu[col * 8 + w]) same = false;
      if (!same) {
        report.mismatches++;
        report.firstMismatch ??= `case ${c} column ${col}: gpu ${Array.from(gpu.slice(col * 8, col * 8 + 5))} cpu ${Array.from(cpu.slice(col * 8, col * 8 + 5))}`;
      }
    }
    report.columns += width;
    report.cases++;
  }
  return report;
}

declare global {
  interface Window {
    __gpuTest: { parity: typeof parity };
  }
}

window.__gpuTest = { parity };
document.body.dataset.ready = "true";
