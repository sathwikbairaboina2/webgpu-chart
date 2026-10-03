# ADR 0006: Host Node toolchain, Docker for the demo image, vanilla TS demo

Date: 2026-10-04. Status: accepted.

## Context
The design doc ran Node and Playwright in containers. GPU tests and benchmarks must use the host GPU (ADR 0003).

## Decision
- Node 24 and pnpm 9.12.0 on the host run dev, unit tests, GPU tests and benchmarks. Exact dependency versions are
  pinned in `package.json` and were checked on npm on 2026-10-04.
- Docker builds the demo (`node:24-alpine`) and serves it with `nginx:1.29-alpine` on host port 5432. The compose
  project is `webgpu-chart` and the container is `webgpu-chart-app`.
- The demo is vanilla TypeScript with plain CSS tokens and no React. The library has zero runtime dependencies;
  uPlot is used only by the demo and bench.
- TypeScript 7 (native compiler) handles typecheck and declaration emit; Vite 8 builds the demo and the library.

## Consequences
- What we gave up: a fully containerized dev loop. A contributor needs Node 24 on the host.
- Without React the demo has a little more DOM code, but the library stays framework-free and the bundle stays small.
