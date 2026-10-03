# webgpu-chart v0.1 progress ledger

Plan: docs/superpowers/plans/2026-10-04-webgpu-chart.md (25 tasks). Spec: docs/superpowers/specs/2026-10-04-webgpu-chart.md. ADRs: docs/adr/0001-0007.
Line format: `Task N: complete - <evidence>` | `Task N: BLOCKED - <reason>` | `Ruling: <decision> - <where recorded>`. Builders stage their line with the task commit.

Plan: written 2026-10-04 by the Opus lead. Every embedded file was prototyped in scratch on this host first: tsc clean; vitest 19 files, 82 passed; playwright 6 passed (fallback 2, gpu 4); lib build + pack smoke ok; bench --quick wrote JSON with one shared inputHash across webgpu, canvas2d and uplot; GIF 4,242,254 bytes. Scratch timings are not results and are not quoted anywhere.
Ruling: GPU tests and the bench run in host Chrome via Playwright channel "chrome", not CDP from Docker; bundled Chromium gets a null adapter on this host - ADR 0003
Ruling: bench measures uncapped rAF deltas (--disable-frame-rate-limit --disable-gpu-vsync) on a production build with a frame-count script; the panel is 120 Hz - ADR 0004
Ruling: bucketing is defined in f32 and the CPU reference emulates it with Math.fround, so GPU parity is a byte comparison; prototype 60 cases / 57,258 columns / 26 wrapped / 0 mismatches - ADR 0002
Ruling: uPlot baseline and pan/zoom/ticks pulled into v0.1 (design doc had them in v0.2) because the README headline compares against uPlot - spec section 3
Ruling: device-lost recovery (invariant 8), WebSocket/MQTT adapters, ingest worker, npm publish and a hosted URL deferred to v0.2; demo shows a message on device loss - spec section 3
Ruling: GpuChart.create takes a container element, not a canvas (the chart owns a plot canvas and an axis overlay) - spec section 4.11
Ruling: isSupported lives in gpu/support.ts with no GPU* types so the published .d.ts typechecks without @webgpu/types; enforced by pnpm pack:smoke - plan Task 9, Task 20
Ruling: the host has two GPUs (NVIDIA RTX 4090 and an AMD iGPU); the README hardware string picks the OS GPU name matching the WebGPU adapter vendor - src/bench/report.ts hardwareLine
Ruling: builder commits end with "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" (accurate attribution); Opus lead commits use the Opus trailer - plan Global Constraints
Ruling: the ledger is a tracked file; each task stages its ledger line with its commit - plan Global Constraints
Ruling: the CI workflow is written and actionlint-checked but cannot run without a remote; no remote will be added - plan Task 21
Ruling: tests and implementation files are extracted from the plan together and the red step is skipped, since the plan code already ran green in scratch - builder process
Task 1: complete - pnpm test 1 file 1 passed; pnpm typecheck exit 0
Task 2: complete - pnpm test 2 files 5 passed; pnpm typecheck exit 0
Task 3: complete - pnpm test 5 files 17 passed; pnpm typecheck exit 0
Task 4: complete - pnpm test 6 files 24 passed; pnpm typecheck exit 0
Task 5: complete - pnpm test 7 files 28 passed; pnpm typecheck exit 0
Task 6: complete - pnpm test 8 files 34 passed; pnpm typecheck exit 0
Task 7: complete - pnpm test 9 files 39 passed; pnpm typecheck exit 0
Task 8: complete - pnpm test 10 files 47 passed; pnpm typecheck exit 0
Task 9: complete - pnpm test 12 files 57 passed; pnpm typecheck exit 0
Task 10: complete - pnpm test 13 files 62 passed; pnpm typecheck exit 0
Task 11: complete - pnpm test 14 files 64 passed; pnpm typecheck exit 0
Task 12: complete - pnpm test 15 files 67 passed; pnpm typecheck exit 0
Ruling: Task 13 adds a placeholder index.html so Playwright's webServer url check (GET /) returns 200 before Task 17 writes the real demo page - cost if wrong: none, Task 17 overwrites it
Task 13: complete - pnpm test:gpu 1 passed (parity); pnpm test 15 files 67 passed; typecheck 0
Task 14: complete - pnpm test:gpu 2 passed; pnpm test 15 files 67 passed; typecheck 0
Task 15: complete - pnpm test 16 files 70 passed; pnpm typecheck exit 0
Task 16: complete - pnpm test 17 files 72 passed; pnpm typecheck exit 0
Ruling: Task 17 step 4 (look at the demo) checked headlessly only: host Chrome loaded http://localhost:5430/, body data-ready became true and the fps readout showed 120; no screenshot was inspected - cost if wrong: visual polish unverified
Task 17: complete - pnpm e2e 2 passed; pnpm test:gpu 3 passed; pnpm test 17 files 72 passed; typecheck 0
Task 18: complete - pnpm test 19 files 82 passed; pnpm typecheck exit 0
Task 19: complete - pnpm test:gpu 4 passed; pnpm build:demo exit 0; pnpm bench -- --quick wrote quick.json with one shared hash across 3 renderers (smoke only, numbers not recorded)
Task 20: complete - pnpm build exit 0 (index.js 48.09 kB, 0 uplot refs); pnpm pack:smoke printed consumer typecheck ok without @webgpu/types
Ruling: CI workflow written and actionlint-clean but cannot run without a remote; none added - plan Task 21
Task 21: complete - docker compose up: webgpu-chart-app 5432->80, / and /bench.html 200, nothing left after down; actionlint no output exit 0
Gates (Task 22): G1 pnpm typecheck exit 0; G2 pnpm test 19 files 82 passed; G3 pnpm build exit 0 (dist/demo/index.html, dist/lib/index.js, dist/lib/index.d.ts exist); G4 pnpm e2e 2 passed; G5 pnpm test:gpu 4 passed; G6 pnpm pack:smoke consumer typecheck ok without @webgpu/types; G8 compose 200 and container removed after down; G9 actionlint no output; port grep and secret grep print nothing. G7 and G10 run in Tasks 23 and 24.
Task 22: complete - G1-G6, G8, G9, port and secret greps pass (see Gates line)
Ruling: bench ran on Windows power plan Balanced (powercfg /getactivescheme), no other automation running - cost if wrong: numbers may be slightly pessimistic
Task 23: complete - pnpm bench ran 4 scenarios, 600 frames each, one inputHash per scenario across renderers, coi true; pnpm bench:table --check ok; headline: **4 series x 1M points: p95 frame time 1.12 ms on WebGPU vs 38.25 ms on uPlot and 33.61 ms on Canvas2D** (uncapped rAF, NVIDIA GeForce RTX 4090, AMD Ryzen 9 7900X 12-Core Processor, Chrome 154, measured 2026-10-04).
Ruling: demo GIF visual check done on frames at 2 s and 5 s only (header, 3 panes, 4 colored series, page fps 120 then 15 with Canvas2D on). Seen but not fixed: the paused uPlot pane shows its pause message faintly over the chart, and the stats label reads 'p95 5 s'. Left for review - cost: cosmetic
Task 24: complete - docs/demo.gif 4368653 bytes, 15.3 s; pnpm bench:table --check exit 0
Build: DONE - all 25 tasks complete
Task 25: complete - docs/DEVDOCS.md, handoff, plan boxes ticked; final gates G1-G7, G10, G11 re-run and pass (test 19 files 82 passed, e2e 2, gpu 4, pack smoke ok, bench:table --check ok, gif 4368653 bytes, no remote)
Review fix: finding 1 (critical) - runner now awaits queue.onSubmittedWorkDone (WebGPU) or a 1x1 getImageData (Canvas2D, uPlot) per frame with one frame in flight; headline is p95 of callback start to completion (completeMs), throughput reported; re-ran pnpm bench (4x1M p95: WebGPU 6.39 ms, Canvas2D 32.58 ms, uPlot 46.73 ms), regenerated README, rewrote ADR 0004 back-pressure sentence.
Review fix: finding 2 (important) - GpuTimer uses a ring of 8 query slots and readback buffers; gpuMs n is now 660 per scenario (includes 60 warmup frames); bench-table shows n/a below 30 samples; demo shows "<0.07" instead of 0.00. Tests: tests/timer.test.ts, tests/report.test.ts.
Review fix: finding 3 (important) - GpuChart owns its device (src/gpu/owned.ts buildOwned): destroyed on destroy and on failed create; demo pane destroys its device on rebuild. Tests: tests/owned.test.ts.
Review fix: finding 4 (minor) - DEVDOCS headline has markers; pnpm bench:table writes and --check verifies README and DEVDOCS.
Review fix: finding 5 (minor) - pane note is now an opaque strip between header and plot; GIF re-recorded (3582042 bytes).
Ruling: GPU pass column covers warmup frames too (n=660) - the timer drains once at run end; splitting needs another hook - cost: small, noted in README.
Ruling: one frame in flight (not two) - gives the cost of a single frame with no hidden queue; loses pipelining so WebGPU is conservative - cost: headline looks weaker than throughput under pipelining.
Review fix gates: typecheck ok; pnpm test 21 files 92 passed; build ok; e2e 2 passed; test:gpu 4 passed; pack:smoke ok; bench:table --check ok. G8/G9 not re-run (Docker/CI unchanged).
