# ADR 0003: GPU tests and benchmarks run in host Chrome via Playwright

Date: 2026-10-04. Status: accepted.

## Context
The design doc planned Playwright in a container that connects to host Chrome over CDP. A prototype on 2026-10-04
showed that Playwright's bundled Chromium gets `requestAdapter() === null` on this host (headless and headed), while
installed Chrome (`channel: "chrome"`, v154) gets an NVIDIA adapter with `timestamp-query`, even headless.
`navigator.gpu` exists only in secure contexts, so test pages must be served from `http://localhost`.

## Decision
- Playwright project `gpu` uses `channel: "chrome"` on the host and runs `e2e/gpu/*.spec.ts` (`pnpm test:gpu`).
- Playwright project `fallback` uses bundled Chromium with `navigator.gpu` stubbed and runs `e2e/fallback/*.spec.ts`
  (`pnpm e2e`). CI runs only this project.
- No CDP bridge from Docker.

## Consequences
- What we gave up: GPU coverage in CI. GitHub-hosted runners have no adapter, so a broken shader is caught by
  `pnpm test:gpu` on a developer machine, not by CI. The handoff and README say so.
- GPU results depend on the host GPU and driver. Every bench result records the UA, adapter info, DPR and canvas size.
