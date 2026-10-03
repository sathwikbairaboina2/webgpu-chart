# ADR 0004: Benchmark methodology

Date: 2026-10-04. Status: accepted.

## Context
We publish one headline number, so the comparison must be fair and repeatable. The host panel runs at 120 Hz, so a
capped rAF loop reports 8.3 ms for anything fast enough. That says nothing about headroom.

## Decision
- Production build (`vite preview` on port 5434), host Chrome with `--disable-frame-rate-limit --disable-gpu-vsync`,
  viewport 1700 x 900, `deviceScaleFactor: 1`, plot canvas 1600 x 600 CSS px.
- Frame time is measured from the start of the frame callback until the renderer has finished the frame: WebGPU awaits
  `queue.onSubmittedWorkDone()`, Canvas2D and uPlot read back a 1x1 pixel, which forces a flush. At most one frame is in
  flight, so the number is the cost of one frame, work queued by earlier frames is not hidden. The rAF delta is also
  recorded but is not the headline. Total throughput (first start to last completion, per frame) is reported next to it.
  GPU compute pass time from `timestamp-query` is recorded for every frame through a ring of query slots.
- Correction (review): the first version used the rAF delta alone and assumed the swap chain applies back-pressure.
  On this host it does not. The GPU ran about 100 ms behind the CPU (roughly 170 frames queued), so the delta only
  measured how fast the CPU submits.
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
- What we gave up: vsync-realistic numbers. The loop is uncapped and serialised (one frame in flight), which measures cost per frame, not what a vsynced page shows. It gives up pipelining, so it is a conservative number for WebGPU.
- uPlot does its own decimation and draws its own axes, so its picture is close to ours but not identical.
- The baselines run on the main thread, like the WebGPU pane. A worker-based comparison is v0.2.
- Results are per machine. The README names the hardware string from the JSON.
