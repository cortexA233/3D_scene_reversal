# 03 — Calibrate and freeze Stone Geometry Baseline v2

Type: task
Status: resolved
Outcome: PASS
Blocked by: 02

Run the frozen Authored Reference-only contract and emit the separately
versioned `stone-geometry-baseline-v2` artifacts.

Acceptance:

- [x] Two independent runs produce stable identity and perturbation evidence.
- [x] Every mild control is inside its hard limits and every applicable
      destructive control remains outside them.
- [x] Intermediate and severe controls preserve the declared sensitivity
      ordering.
- [x] Non-separating metrics are replaced or made diagnostic without using
      candidate results.
- [x] Numeric limits and report checksums freeze before candidate evaluation.
- [x] Calibration overlap fails this ticket and stops the restart.

## Comments

Numerical v2 tolerances may be looser than v1, but only as the predeclared
reference-only rule produces them.

## Answer

Two independent candidate-free browser runs completed the 12-view, three-pass,
29-scenario Authored Reference protocol with byte- and metric-stable evidence.
The one permitted pre-freeze correction narrowed metric applicability to the
destructive controls each metric is intended to detect, strengthened the
profile-compression destructive control from `0.35` to `0.80`, and accepted a
`<= 1e-6` identity depth rasterization epsilon. No candidate module, capture,
metric, or report was loaded into threshold selection.

`stone-geometry-baseline-v2` freezes all eight metrics as hard gates with zero
diagnostic demotions:

- bounds maximum/anchor: `0.022` / `0.030824658817`;
- silhouette mean/worst IoU: `0.844703618056` / `0.811907117733`;
- silhouette mean/P95 edge distance: `10.600715268357` /
  `33.557641192199 px`;
- depth mean/P95: `0.040584035391` / `0.145860441186`.

Every mild control passes, all eight sensitivity orderings pass, all ten
must-reject controls fail, and candidate hashes match before and after both
runs. The baseline and complete report are frozen before Ticket 04 evaluates
the candidate.
