# 02 — Freeze the Stone v2 calibration contract

Type: task
Status: resolved
Outcome: PASS
Blocked by: 01

Declare the candidate quarantine and the complete reference-only Stone
Geometry Baseline v2 calibration contract before running calibration.

Acceptance:

- [x] Record commit and content hashes for the Stone generator, recipe, and
      existing v1/v2 evidence.
- [x] Freeze exact mild, intermediate, severe, and destructive perturbations.
- [x] Freeze required metrics, diagnostic metrics, repeatability allowances,
      and the candidate-independent threshold-selection rule.
- [x] Prohibit replacement captures and known candidate values from calibration
      inputs.
- [x] Fail closed when the declared bracket cannot separate mild from
      destructive controls.

## Comments

Created by ADR-0024 and activated by ADR-0026 after the corrected fitter
reproduced both the existing recipe and its v1 failure. This ticket defines
evidence and policy only; it does not change thresholds or production code.

## Answer

The candidate quarantine freezes commit
`e2d3b5e70a985abffa69a7faaf8dc38dc9b2fc35` with SHA-256 and byte lengths for
six candidate/dependency files, three evidence/reproducibility files, and two
v1 baseline files. `npm run check:stone-v2-contract` fails on any drift.

The separately frozen calibration contract declares 28 reference-only
scenarios: eight mild-envelope cases, complete intermediate/severe ladders,
and ten must-reject controls. Eight geometry metrics carry fixed
repeatability allowances and predeclared destructive applicability. Threshold
selection accepts exactly two Authored Reference-only runs, derives the
least-permissive mild envelope, automatically demotes non-separating metrics,
and fails unless at least two bounds, two silhouette, and one depth metric
remain hard gates. Candidate imports, captures, metrics, and threshold
overrides are explicitly prohibited.
