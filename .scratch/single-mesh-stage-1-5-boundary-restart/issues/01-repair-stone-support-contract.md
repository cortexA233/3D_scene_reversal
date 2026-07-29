# 01 — Repair and reevaluate the Stone support contract

Type: task
Status: ready-for-agent

Remove the semantic mismatch between the development fitter and production
Object Generator, refit only the existing 24 support distances, and reevaluate
the corrected candidate against unchanged v1.

Acceptance:

- [ ] Fitter and Object Generator consume one canonical direction definition.
- [ ] A regression test rejects direction-count, ordering, or value drift.
- [ ] Only the existing 24 support distances may be refitted; representation,
      orientation controls, appearance controls, and budgets remain unchanged.
- [ ] Corrected candidate passes complete-source scalar, recipe, gzip,
      triangle, draw, memory, generation, determinism, and Reference
      Independence gates.
- [ ] Corrected candidate runs the complete unchanged v1 visual gate in Chrome.
- [ ] A v1 pass cancels Tickets 02–04; a v1 failure freezes the corrected
      candidate and activates Ticket 02 without changing a threshold.

## Comments

The `6ebb70c` artifact remains a valid negative report for its mismatched
recipe/generator contract, but it no longer counts as a representation-family
failure.
