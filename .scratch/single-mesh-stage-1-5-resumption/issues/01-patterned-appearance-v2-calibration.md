# 01 — Freeze Patterned Appearance Baseline v2

Type: task
Status: ready-for-agent

Build a candidate-independent browser calibration runner for the Umbrella
Authored Reference and freeze the widest safe complex-pattern appearance gate.

Acceptance:

- [ ] Calibration imports and reads no replacement generator, recipe, shader,
      candidate report, or candidate capture.
- [ ] Contract source, scenario definitions, applicability matrix, selection
      rule, and two independent runs are hash-frozen.
- [ ] Identity and repeated captures pass.
- [ ] Mild position, phase, scale, layout, and palette controls pass.
- [ ] Flat, wrong-palette, flower/leaf/branch deletion, 50% coverage loss, and
      large phase/scale controls each fail an applicable hard metric.
- [ ] Thresholds are the most permissive values that retain the declared guard
      band; complex-pattern thresholds may be materially looser than v1.
- [ ] Inseparable metrics are replaced or made diagnostic before freeze.
- [ ] Machine-readable baseline/report, reproducible command, and tests pass.

## Comments

This ticket authorizes reference-side development only. It does not authorize
editing or evaluating the Umbrella candidate.
