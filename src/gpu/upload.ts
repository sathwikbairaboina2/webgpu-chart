import type { Ring } from "../core/ring";

/** The part of GPUQueue the uploader uses. Tests pass a recorder. */
export interface QueueLike {
  writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: Float32Array, dataOffset: number, size: number): void;
}

/** Bytes per sample in the GPU ring (t and y as f32). */
export const SAMPLE_BYTES = 8;

/**
 * Uploads only the ring's dirty ranges (invariant 7) and returns the bytes written.
 * For a TypedArray, writeBuffer's dataOffset and size count elements, not bytes.
 */
export function uploadDirty(queue: QueueLike, buffer: GPUBuffer, ring: Ring): number {
  let bytes = 0;
  for (const r of ring.takeDirty()) {
    const n = r.end - r.start;
    if (n <= 0) continue;
    queue.writeBuffer(buffer, r.start * SAMPLE_BYTES, ring.data, r.start * 2, n * 2);
    bytes += n * SAMPLE_BYTES;
  }
  return bytes;
}
