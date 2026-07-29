# 01 — Freeze Patterned Appearance Baseline v2

Type: task
Status: resolved
Outcome: PASS

Build a candidate-independent browser calibration runner for the Umbrella
Authored Reference and freeze the widest safe complex-pattern appearance gate.

Acceptance:

- [x] Calibration imports and reads no replacement generator, recipe, shader,
      candidate report, or candidate capture.
- [x] Contract source, scenario definitions, applicability matrix, selection
      rule, and two independent runs are hash-frozen.
- [x] Identity and repeated captures pass.
- [x] Mild position, phase, scale, layout, and palette controls pass.
- [x] Flat, wrong-palette, flower/leaf/branch deletion, 50% coverage loss, and
      large phase/scale controls each fail an applicable hard metric.
- [x] Thresholds are the most permissive values that retain the declared guard
      band; complex-pattern thresholds may be materially looser than v1.
- [x] Inseparable metrics are replaced or made diagnostic before freeze.
- [x] Machine-readable baseline/report, reproducible command, and tests pass.

## Comments

This ticket authorizes reference-side development only. It does not authorize
editing or evaluating the Umbrella candidate.

## Answer

Two byte-stable reference-only Chrome runs pass the frozen calibration contract.
The widest-safe global thresholds are mean DeltaE `6.696608`, P90 DeltaE
`30.829967`, mean masked SSIM `0.728705`, and worst-view SSIM `0.586956`.
Flower, leaf, and branch Semantic Pattern Recall minima are `0.045119`,
`0.161499`, and `0.590524`; roughness and metalness retain v1 values.

One candidate-free reference correction changed whole-texture transforms to
motif-only transforms, accepted measured identity-copy tolerance, added semantic
family recall, and made discontinuous palette clustering diagnostic. All ten
should-pass controls pass and all ten destructive controls fail. Candidate
hashes match before and after, and the calibration source hashes are retained in
the final report. Umbrella candidate fitting is now authorized under Ticket 02;
the baseline is frozen and cannot be changed by candidate evidence.
