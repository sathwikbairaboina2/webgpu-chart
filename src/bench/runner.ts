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
  /** Resolves when the GPU (or canvas) has finished the frames rendered so far. Missing means "finished at once". */
  settled?(): Promise<void>;
  /** All GPU pass times recorded during the run. */
  drainGpuMs?(): Promise<number[]>;
}

export interface RunOptions {
  seriesIds: string[];
  warmupFrames: number;
  raf: (cb: (now: number) => void) => void;
  /** Aborts the run when it returns false (hidden tabs throttle rAF). */
  isVisible?: () => boolean;
  /** Frames the renderer may have submitted but not finished. Default 1: each frame is finished before the next starts. */
  maxInFlight?: number;
  /** Clock in ms. Default performance.now. */
  now?: () => number;
}

export interface RendererRun {
  /** rAF deltas, one per measured step. With maxInFlight 1 they include the wait for the previous frame to finish. */
  frameMs: Summary;
  /** Per measured frame: from the start of the callback (ingest, state update, render) until the work has finished executing. */
  completeMs: Summary;
  /** Mean ms per frame from the first measured frame's start to the last frame's completion. */
  throughputMs: number;
  /** GPU compute pass times from timestamp queries, one per timed frame. */
  gpuMs: Summary | null;
  /** FNV-1a of every sample fed to the chart plus the script. Equal across renderers (invariant 9). */
  inputHash: string;
  uploadBytes: number;
}

/**
 * Loads `initialPoints` samples per series, renders `warmupFrames` frames, then one frame per script step.
 * Every frame is awaited to completion (chart.settled) with at most `maxInFlight` unfinished, so a renderer whose
 * work is queued on the GPU is charged for that work. The delta measured at callback i covers the frame rendered
 * at callback i - 1, so one extra callback closes the run.
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
  const complete: Promise<number>[] = [];
  const done: Promise<number>[] = [];
  const clock = opts.now ?? (() => performance.now());
  const depth = Math.max(1, opts.maxInFlight ?? 1);
  let firstStart = 0;
  let uploadBytes = 0;
  let i = -opts.warmupFrames;
  let last = 0;

  return new Promise<RendererRun>((resolve, reject) => {
    const step = async (now: number) => {
      if (opts.isVisible && !opts.isVisible()) throw new Error("bench tab is hidden, so rAF is throttled; aborting");
      if (i >= 1) frameMs.push(now - last);
      last = now;
      if (i === script.length) {
        const ends = await Promise.all(done);
        const completeMs = await Promise.all(complete);
        const gpuAll = chart.drainGpuMs ? await chart.drainGpuMs() : gpu;
        resolve({
          frameMs: summarize(frameMs),
          completeMs: summarize(completeMs),
          throughputMs: (Math.max(...ends) - firstStart) / script.length,
          gpuMs: gpuAll.length > 0 ? summarize(gpuAll) : null,
          inputHash: hash.hex(),
          uploadBytes,
        });
        return;
      }
      const idx = done.length;
      if (idx >= depth) await done[idx - depth];
      const start = clock();
      if (i >= 0) apply(script[i]);
      else if (script[0]?.kind === "view") apply(script[0]);
      const st = chart.frame(now);
      const finished = (chart.settled?.() ?? Promise.resolve()).then(clock);
      finished.catch(() => undefined);
      done.push(finished);
      if (i >= 0) {
        if (i === 0) firstStart = start;
        complete.push(finished.then((end) => end - start));
        if (st.gpuMs !== null) gpu.push(st.gpuMs);
        uploadBytes += st.uploadBytes;
      }
      i++;
      opts.raf(tick);
    };
    const tick = (now: number) => {
      step(now).catch(reject);
    };
    opts.raf(tick);
  });
}
