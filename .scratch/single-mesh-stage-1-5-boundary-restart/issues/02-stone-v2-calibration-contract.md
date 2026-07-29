# 02 — Freeze the Stone v2 calibration contract

Type: task
Status: ready-for-agent
Blocked by: 01

Declare the candidate quarantine and the complete reference-only Stone
Geometry Baseline v2 calibration contract before running calibration.

Acceptance:

- [ ] Record commit and content hashes for the Stone generator, recipe, and
      existing v1/v2 evidence.
- [ ] Freeze exact mild, intermediate, severe, and destructive perturbations.
- [ ] Freeze required metrics, diagnostic metrics, repeatability allowances,
      and the candidate-independent threshold-selection rule.
- [ ] Prohibit replacement captures and known candidate values from calibration
      inputs.
- [ ] Fail closed when the declared bracket cannot separate mild from
      destructive controls.

## Comments

Created by ADR-0024 and activated by ADR-0026 after the corrected fitter
reproduced both the existing recipe and its v1 failure. This ticket defines
evidence and policy only; it does not change thresholds or production code.
