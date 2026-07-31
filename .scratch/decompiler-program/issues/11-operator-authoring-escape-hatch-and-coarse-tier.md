# 11 — Operator authoring escape hatch and the coarse tier

Type: task
Status: ready-for-agent
Blocked by: 08

**What to build:** the two paths that keep the pipeline from dead-ending — authoring a new operator
when the library cannot cover a shape, and degrading gracefully when an input is too complex for the
full treatment.

The escape hatch is deliberately evidence-gated rather than always available. If a decider could
author freely, the pipeline degrades into free-form code generation, the library never accumulates, and
compactness stops being auditable. Requiring a measured library-only failure first is what makes new
code both justified and reusable.

- [ ] The operator-authoring Decision Point unlocks only after a library-only beam search records a
      measured geometry-gate failure for that unit
- [ ] The unlocking failure is recorded in the Structure Manifest, so every authored operator is
      traceable to the coverage gap that justified it
- [ ] An authored operator is rejected unless it passes every Contract Operator check
- [ ] An admitted operator enters the versioned library and is available to subsequent runs without
      further authoring
- [ ] The complexity gate assigns full, coarse, or rejected from the pre-estimated total budget, and a
      rejection includes a split recommendation
- [ ] Runtime monitoring downgrades a full run to coarse rather than failing when actual consumption
      exceeds the estimate
- [ ] The coarse path skips beam search, uses conservative operators and flat material roles, stays
      within budget, and is marked as coarse in the evidence
- [ ] A coarse result still passes every contract check; only quality is reduced
