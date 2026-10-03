# ADR 0001: Min/max/first/last decimation (M4) over LTTB

Date: 2026-10-04. Status: accepted.

## Context
A 1600 px wide chart cannot show 1M samples per series one by one. We must reduce the visible window per frame.
The reduction must keep spikes (telemetry users look for them) and must parallelize on the GPU.

## Decision
Reduce each pixel column to `min, max, first, last, n` (the M4 aggregation from Jugel et al., VLDB 2014).
Draw each column as a vertical min-max segment plus a connector from the previous column's `last` to this column's
`first`. Reduction work is bounded by the visible samples, and drawing work by the pixel width.

## Alternatives
- LTTB (largest triangle three buckets): it picks one point per bucket based on the previous pick, so it is
  sequential and awkward on the GPU. It can also hide a spike that is not the "largest triangle".
- Random or stride sampling: cheap, but drops spikes. It fails invariant 2.

## Consequences
- What we gave up: LTTB's smoother look when zoomed out on noisy data. M4 output looks like a filled band where data
  is dense. That is the honest picture of the data, but it is less pretty.
- Every column costs 32 bytes on the GPU regardless of point count.
