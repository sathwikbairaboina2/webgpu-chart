import type { SeriesData } from "../core/dataset";
import { summarize, type Summary } from "../core/stats";
import type { FrameStats } from "../chart/backend";
import type { ChartModel } from "../chart/model";
import { Fnv1a } from "./fairness";
import type { Step } from "./script";

/** What the runner needs from a chart. The real Chart satisfies it; tests pass a fake. */
export interface BenchChart {
  readonly model: ChartModel;
  frame(now: number): FrameStats;
}

export interface RunOptions {
  seriesIds: string[];
  warmupFrames: number;
  raf: (cb: (now: number) => void) => void;
  /** Aborts the run when it returns false (hidden tabs throttle rAF). */
  isVisible?: () => boolean;
}

export interface RendererRun {
  /** rAF deltas, one per measured step. */
  frameMs: Summary;
  gpuMs: Summary | null;
  /** FNV-1a of every sample fed to the chart plus the script. Equal across renderers (invariant 9). */
  inputHash: string;
  uploadBytes: number;
}

/**
 * Loads `initialPoints` samples per series, renders `warmupFrames` frames, then one frame per script step.
 * The delta measured at callback i covers the frame rendered at callback i - 1, so one extra callback closes the run.
 */
export function runRenderer(
  chart: BenchChart,
  data: SeriesData[],
  initialPoints: number,
  script: Step[],
  opts: RunOptions,
): Promise<RendererRun> {
  const hash = new Fnv1a();
  const ids = opts.seriesIds;
  if (ids.length > data.length) throw new RangeError(`${ids.length} series ids but only ${data.length} data series`);
  const feed = (s: number, from: number, to: number) => {
    const t = data[s].t.subarray(from, to);
    const y = data[s].y.subarray(from, to);
    hash.updateArray(t).updateArray(y);
    chart.model.append(ids[s], t, y);
  };
  for (let s = 0; s < ids.length; s++) feed(s, 0, initialPoints);
  hash.updateString(JSON.stringify(script));

  let cursor = initialPoints;
  const apply = (step: Step) => {
    if (step.kind === "view") {
      chart.model.setViewport({ t0: step.t0, t1: step.t1 });
      return;
    }
    chart.model.windowMs = step.windowMs;
    chart.model.setViewport("follow");
    if (cursor + step.append > data[0].t.length) throw new RangeError("dataset is too short for the script");
    for (let s = 0; s < ids.length; s++) feed(s, cursor, cursor + step.append);
    cursor += step.append;
  };

  const frameMs: number[] = [];
  const gpu: number[] = [];
  let uploadBytes = 0;
  let i = -opts.warmupFrames;
  let last = 0;

  return new Promise<RendererRun>((resolve, reject) => {
    const tick = (now: number) => {
      try {
        if (opts.isVisible && !opts.isVisible()) throw new Error("bench tab is hidden, so rAF is throttled; aborting");
        if (i >= 1) frameMs.push(now - last);
        last = now;
        if (i === script.length) {
          resolve({
            frameMs: summarize(frameMs),
            gpuMs: gpu.length > 0 ? summarize(gpu) : null,
            inputHash: hash.hex(),
            uploadBytes,
          });
          return;
        }
        if (i >= 0) apply(script[i]);
        else if (script[0]?.kind === "view") apply(script[0]);
        const st = chart.frame(now);
        if (i >= 0) {
          if (st.gpuMs !== null) gpu.push(st.gpuMs);
          uploadBytes += st.uploadBytes;
        }
        i++;
        opts.raf(tick);
      } catch (e) {
        reject(e);
      }
    };
    opts.raf(tick);
  });
}
