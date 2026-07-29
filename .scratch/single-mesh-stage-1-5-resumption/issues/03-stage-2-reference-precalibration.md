# 03 — Freeze Bamboo Shoot and Mushroom reference baselines

Type: task
Status: ready-for-agent
Blocked by: 02

Run the accepted separate reference-only Calibration Brackets and freeze the
two Category-specific Quality Baselines and ADR-0020 budgets together.

Acceptance:

- [ ] Both objects run identity, repeatability, common scale/pivot/rotation,
      and their full object-specific ladders.
- [ ] Bamboo taper, sheath, axial-layer, open-surface, silhouette-element,
      palette, motif, flat, and coverage controls are represented.
- [ ] Mushroom form-size, proportion, lean, layout, resolution, member/part
      deletion, homogenization, role-swap, palette, motif, flat, and coverage
      controls are represented.
- [ ] Every should-pass control passes and every must-reject control fails an
      applicable hard metric in two independent runs.
- [ ] Inseparable metrics are replaced or made diagnostic before freeze.
- [ ] Baseline values and metric applicability stay object-specific.
- [ ] Both immutable contracts, reports, budgets, checks, and tests freeze in
      one passing operation before either Stage 2 candidate is fitted.

## Comments

This ticket creates evaluation evidence only. It does not create Bamboo Shoot
or Mushroom production generators, recipes, or implementation tickets.
