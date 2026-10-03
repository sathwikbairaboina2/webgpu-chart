# ADR 0002: One invocation per column, f32 bucketing contract, exact CPU parity

Date: 2026-10-04. Status: accepted.

## Context
The GPU result must equal the CPU reference exactly (invariant 1). If the CPU computes the column of a sample in f64
and the GPU in f32, samples near a column boundary land in different columns and parity fails.

## Decision
- The bucketing contract is defined in f32: `col = clamp(floor(f32(f32(t - t0) * scale)), 0, width - 1)`, with
  `t, t0` as f32 relative ms and `scale = f32(width / max(t1 - t0, 1e-3))` computed once on the CPU and passed as a
  uniform. The CPU reference applies `Math.fround` after each operation. WGSL defines f32 `-` and `*` as correctly
  rounded, and there is no add after the multiply for a driver to fuse.
- The kernel runs one invocation per column. Each invocation binary-searches the first visible sample whose column is
  at least `c` (columns are monotonic because `t` is), then scans forward while the column equals `c`. No atomics.
- Input values are canonical (`-0` becomes `+0`, subnormals become `0`; see spec section 4), so the 32-byte bucket
  records can be compared as bytes.

Prototype (2026-10-04, host Chrome 154, NVIDIA Lovelace): 40 seeded random cases, 43,431 columns, wrapped rings and
duplicate timestamps, 0 mismatches. A 4 x 1M point pass took about 0.6 ms with `timestamp-query` in that scratch
run. That number is only a feasibility check and is not published.

## Alternatives
- A workgroup-per-chunk reduction with atomic min/max: WGSL has no float atomics. Bit tricks work for min/max but
  not for first/last, and they add a second pass.
- f64 on the CPU with a tolerance in the parity test: this hides real off-by-one-column bugs.

## Consequences
- What we gave up: load balance. If one column holds most of the window (a burst of samples at one time), one
  invocation does most of the work. Typical telemetry is evenly spaced, so we accept that.
- The CPU reference is slower than a plain f64 loop because of `Math.fround`. It serves Canvas2D and the tests.
