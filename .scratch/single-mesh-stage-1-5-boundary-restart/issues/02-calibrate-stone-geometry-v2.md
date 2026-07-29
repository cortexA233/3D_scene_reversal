# 02 — Calibrate and freeze Stone Geometry Baseline v2

Type: task
Status: ready-for-agent
Blocked by: 01

Run the frozen Authored Reference-only contract and emit the separately
versioned `stone-geometry-baseline-v2` artifacts.

Acceptance:

- [ ] Two independent runs produce stable identity and perturbation evidence.
- [ ] Every mild control is inside its hard limits and every applicable
      destructive control remains outside them.
- [ ] Intermediate and severe controls preserve the declared sensitivity
      ordering.
- [ ] Non-separating metrics are replaced or made diagnostic without using
      candidate results.
- [ ] Numeric limits and report checksums freeze before candidate evaluation.
- [ ] Calibration overlap fails this ticket and stops the restart.

## Comments

Numerical v2 tolerances may be looser than v1, but only as the predeclared
reference-only rule produces them.
