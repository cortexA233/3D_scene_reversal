# 04 — Patterned Appearance Baseline v2 calibration

Type: task
Status: wontfix
Blocked by: 03

Before fitting a new Umbrella appearance, calibrate a separately versioned baseline using reference-only mild and destructive motif perturbations.

Acceptance:

- [ ] Identity and repeatability pass.
- [ ] Declared mild position, phase, scale, layout, and palette controls pass.
- [ ] Flat appearance, wrong dominant palette, major motif deletion, 50% coverage loss, and large phase/scale errors fail.
- [ ] Every hard metric separates acceptable from destructive controls or is replaced/made diagnostic.
- [ ] Thresholds may be looser than v1 but freeze before candidate fitting.
- [ ] A machine-readable report and failing check command are retained.

## Comments

Not run under this specification. Ticket 03 resolved with a negative kill-gate
result, so calibrating a later candidate would violate the frozen order. This
ticket may be reopened only by a new boundary decision.
