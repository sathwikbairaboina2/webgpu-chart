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
