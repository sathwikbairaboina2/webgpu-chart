# ADR 0004: Benchmark methodology

Date: 2026-10-04. Status: accepted.

## Context
We publish one headline number, so the comparison must be fair and repeatable. The host panel runs at 120 Hz, so a
capped rAF loop reports 8.3 ms for anything fast enough. That says nothing about headroom.

## Decision
- Production build (`vite preview` on port 5434), host Chrome with `--disable-frame-rate-limit --disable-gpu-vsync`,
  viewport 1700 x 900, `deviceScaleFactor: 1`, plot canvas 1600 x 600 CSS px.
- Frame time is the delta between consecutive rAF callbacks. The swap chain applies back-pressure, so GPU work that
  does not finish shows up as longer deltas. GPU pass time from `timestamp-query` is recorded separately when the
  adapter has it.
- The script counts frames, not wall-clock time: 60 warmup frames, then N measured steps (default 600). The phases
  are pan, zoom in 1000x, zoom out, then follow mode appending ingest samples each step (1 kHz at a nominal 60 fps).
  Every renderer gets the identical seeded dataset and step list, and a hash of both is stored per renderer
  (invariant 9).
- All three renderers get the same y range, canvas size and DPR.
- The Canvas2D baseline uses the same CPU decimation and segment rule as the GPU path, so the only difference is where
  the work runs. uPlot gets its data through a sliding window of typed arrays (amortized O(new) per append, no full
  copy per frame), which is how a careful integrator would feed it.
- The bench aborts if `document.visibilityState` is not `visible`.

## Consequences
- What we gave up: vsync-realistic numbers. Uncapped deltas measure throughput, and the README says "uncapped".
- uPlot does its own decimation and draws its own axes, so its picture is close to ours but not identical.
- The baselines run on the main thread, like the WebGPU pane. A worker-based comparison is v0.2.
- Results are per machine. The README names the hardware string from the JSON.
