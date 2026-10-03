import { NO_ADAPTER, NO_GPU, browserNavigator } from "./support";

export interface AdapterSummary {
  vendor: string;
  architecture: string;
  description: string;
}

export interface AcquiredDevice {
  device: GPUDevice;
  adapter: AdapterSummary;
  /** True when the device was created with "timestamp-query". */
  timestamps: boolean;
}

/** The part of `navigator` acquireDevice uses. Tests pass fakes. */
export interface GpuNavigator {
  gpu?: Pick<GPU, "requestAdapter">;
}

/** Requests an adapter and a device. Asks for "timestamp-query" only when wanted and available. */
export async function acquireDevice(
  nav: GpuNavigator = browserNavigator<GpuNavigator>(),
  opts: { timestamps?: boolean } = {},
): Promise<AcquiredDevice> {
  if (!nav.gpu) throw new Error(NO_GPU);
  const adapter = await nav.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error(NO_ADAPTER);
  const timestamps = Boolean(opts.timestamps) && adapter.features.has("timestamp-query");
  const device = await adapter.requestDevice({
    requiredFeatures: timestamps ? ["timestamp-query"] : [],
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxBufferSize: adapter.limits.maxBufferSize,
    },
  });
  const info = adapter.info;
  return {
    device,
    adapter: {
      vendor: info?.vendor ?? "",
      architecture: info?.architecture ?? "",
      description: info?.description ?? "",
    },
    timestamps,
  };
}
