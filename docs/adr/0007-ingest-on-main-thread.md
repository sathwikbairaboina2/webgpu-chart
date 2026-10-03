# ADR 0007: Ingest and the synthetic source run on the main thread in v0.1

Date: 2026-10-04. Status: accepted.

## Context
The design doc puts parsing and batching in a worker. v0.1 has only a synthetic source; WebSocket and MQTT are v0.2.

## Decision
The synthetic source is a timer on the main thread that emits a batch every 16 ms (1 kHz per series by default).
Batches go through `validateBatch` and then `Ring.append`. The bench does not use the timer at all. It appends a
fixed number of samples per scripted step, so every renderer sees the same input.

## Consequences
- What we gave up: main-thread headroom when parsing real network data. With synthetic data the generation cost is
  small (16 samples per series per batch). The worker plus OffscreenCanvas path is listed for v0.2.
