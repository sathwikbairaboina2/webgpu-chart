// Public entry of @sathwik/gpu-timeseries. Nothing exported here may mention GPU* types.
export { GpuChart, type SeriesHandle, type SeriesOptions } from "./GpuChart";
export { Chart, type ChartOptions, type BackendFactory } from "./chart/Chart";
export type { Backend, BackendKind, FrameInput, FrameStats, RenderStats } from "./chart/backend";
export { Canvas2DBackend } from "./baselines/canvas2d";
export { isSupported, type SupportResult } from "./gpu/support";
export { Ring, MAX_SPAN_MS, type DirtyRange, type IndexRange } from "./core/ring";
export { decimate, makeParams, columnOf, createBuckets, BUCKET_FLOATS, BUCKET_BYTES, type Buckets, type DecimateParams } from "./core/decimate";
export { segmentsFromBuckets, type YMap } from "./core/segments";
export { niceTicks, timeTicks, formatTime, formatValue } from "./core/ticks";
export { validateBatch, type IngestReport, type OrderPolicy } from "./core/ingest";
export type { Viewport, Bounds } from "./core/viewport";
export const VERSION = "0.1.0";
