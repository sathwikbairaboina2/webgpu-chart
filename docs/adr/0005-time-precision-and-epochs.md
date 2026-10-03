# ADR 0005: f32 relative time with integer epochs and a 2^24 ms span

Date: 2026-10-04. Status: accepted.

## Context
GPU buffers hold f32. Unix milliseconds (about 1.76e12) stored as f32 are spaced 131,072 ms apart, which is useless.

## Decision
- Each ring keeps an integer `epoch` (absolute ms, f64) and stores `t - epoch` as f32.
- `MAX_SPAN_MS = 2^24` (16,777,216 ms, about 4.66 h). Below 2^24 an f32 holds every integer exactly, so the time
  error is at most 0.5 ms.
- On append, the ring first evicts samples older than `newest - MAX_SPAN_MS`. Then, if `newest - epoch` is more than
  `MAX_SPAN_MS`, it shifts the epoch by `floor(oldest relative t)` and rewrites the stored times. The rewrite is
  exact, because each result is smaller in magnitude than the f32 it came from. The whole ring is marked dirty for
  re-upload.

## Consequences
- What we gave up: windows longer than 4.66 hours. A 1 Hz stream with capacity 1M holds only the last 4.66 h.
  The docs state this limit.
- A rebase costs one full re-upload (capacity x 8 bytes). At 1 kHz that happens at most once every 4.66 hours.
