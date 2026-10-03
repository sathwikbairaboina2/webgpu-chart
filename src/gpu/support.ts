// No GPU* types in this file: it is part of the public .d.ts surface.

export interface SupportResult {
  ok: boolean;
  reason?: string;
}

/** The part of `navigator` that isSupported needs. Tests pass fakes. */
export interface SupportNavigator {
  gpu?: { requestAdapter(options?: { powerPreference?: "low-power" | "high-performance" }): Promise<unknown> };
}

export const NO_GPU =
  "This browser does not expose WebGPU (navigator.gpu is missing). Use a current Chrome or Edge, served from https or http://localhost.";
export const NO_ADAPTER =
  "WebGPU is present but no GPU adapter is available (blocklisted driver, disabled hardware acceleration, or a headless runner without a GPU).";

export function browserNavigator<T>(): T {
  return ((globalThis as { navigator?: unknown }).navigator ?? {}) as T;
}

export async function isSupported(nav: SupportNavigator = browserNavigator<SupportNavigator>()): Promise<SupportResult> {
  if (!nav.gpu) return { ok: false, reason: NO_GPU };
  try {
    const adapter = await nav.gpu.requestAdapter({ powerPreference: "high-performance" });
    return adapter ? { ok: true } : { ok: false, reason: NO_ADAPTER };
  } catch (e) {
    return { ok: false, reason: `requestAdapter failed: ${(e as Error).message}` };
  }
}
