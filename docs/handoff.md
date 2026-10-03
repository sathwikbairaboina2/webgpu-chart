# Handoff log

## 2026-10-04, Claude (Opus lead, planning), branch main

What changed:
- `git init -b main`. Wrote the spec (`docs/superpowers/specs/2026-10-04-webgpu-chart.md`), ADRs 0001 to 0007, the 25-task plan (`docs/superpowers/plans/2026-10-04-webgpu-chart.md`) and the ledger (`.superpowers/sdd/2026-10-04-webgpu-chart/progress.md`).
- Prototyped every risky API on this host before planning: WebGPU in Playwright (host Chrome works even headless, bundled Chromium gets no adapter), uncapped rAF flags, the decimation kernel's byte-exact parity with an f32-emulating CPU reference, same-task canvas readback, video capture of WebGPU canvases, uPlot's synchronous `batch()`, TypeScript 7 declaration emit, the pack smoke test and GIF size limits.

What is left:
- The whole build (plan tasks 1 to 25), then review, fixes, verification, DEVDOCS and the board update.

How to verify the planning work:
- `git log --oneline` shows the planning commit.
- Read the plan's "Already done" and "Gates" sections; the gate commands are the acceptance test for the build.

## 2026-10-04, Claude (Sonnet builder), branch main

What changed:
- Built plan tasks 1 to 25: scaffold, core (ring, decimation, segments, ticks, ingest, viewport, stats), GPU helpers and shaders, chart model and panes, Canvas2D and uPlot baselines, public `GpuChart` API, demo page, bench core and page, library build, Docker and CI, headline benchmark, demo GIF, DEVDOCS.
- Gates: typecheck exit 0; `pnpm test` 19 files, 82 passed; `pnpm e2e` 2 passed; `pnpm test:gpu` 4 passed; `pnpm pack:smoke` ok; Docker demo returned 200 and left nothing after down; actionlint clean; `docs/demo.gif` 4,368,653 bytes.
- Headline (generated from `bench/results/latest.json`): see the first line of README.md.

What was not run: GitHub CI (no remote), npm publish, browsers other than host Chrome 154.

What is left: v0.2 items in `docs/DEVDOCS.md` section 7, plus the cosmetic paused-pane text overlap in the uPlot pane.

How to verify: run the Gates table commands in the plan (G1 to G11).

## 2026-10-04, Claude (Opus lead, verify and docs), branch main

What changed:
- Confirmed the three review findings are fixed: WebGPU frames are now timed until `queue.onSubmittedWorkDone()` with one frame in flight (headline 6.39 ms p95 at 4x1M, was a CPU-submit 1.12 ms); `GpuTimer` times every frame through a ring of 8 query slots (n=660 per scenario); `GpuChart` and the demo destroy the devices they acquire.
- Small leftover fixed: `src/bench/page.ts` now destroys its WebGPU device after each renderer.
- Rewrote `docs/DEVDOCS.md` as the developer guide (headline markers kept, so `pnpm bench:table` still updates it).

Gates run in this session: typecheck exit 0; `pnpm test` 21 files, 92 passed; `pnpm build` ok; `pnpm pack:smoke` ok; `pnpm e2e` 2 passed; `pnpm test:gpu` 4 passed; `pnpm bench:table --check` ok; Docker demo returned 200 on port 5432 and `docker compose down` left no containers; actionlint exit 0.

What was not run: `pnpm bench` (numbers are from the fix commit; the page change only releases the device after measuring), GitHub CI (no remote), browsers other than host Chrome 154.

What is left: the v0.2 list in `docs/DEVDOCS.md` section 7 (device-lost recovery, real adapters, ingest worker, npm publish, hosted URL).

How to verify: `pnpm typecheck && pnpm test && pnpm build && pnpm e2e && pnpm test:gpu && pnpm pack:smoke && pnpm bench:table --check`.
