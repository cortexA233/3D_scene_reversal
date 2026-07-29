# 01 — Repair and reevaluate the Stone support contract

Type: task
Status: resolved
Outcome: PASS

Remove the semantic mismatch between the development fitter and production
Object Generator, refit only the existing 24 support distances, and reevaluate
the corrected candidate against unchanged v1.

Acceptance:

- [x] Fitter and Object Generator consume one canonical direction definition.
- [x] A regression test rejects direction-count, ordering, or value drift.
- [x] Only the existing 24 support distances may be refitted; representation,
      orientation controls, appearance controls, and budgets remain unchanged.
- [x] Corrected candidate passes complete-source scalar, recipe, gzip,
      triangle, draw, memory, generation, determinism, and Reference
      Independence gates.
- [x] Corrected candidate runs the complete unchanged v1 visual gate in Chrome.
- [x] A v1 pass cancels Tickets 02–04; a v1 failure freezes the corrected
      candidate and activates Ticket 02 without changing a threshold.

## Comments

The `6ebb70c` artifact remains a valid negative report. The initial
recipe/generator mismatch suspicion was resolved as development-fitter drift;
ADR-0026 records why the representation-family failure still counts.

## Answer

The apparent contract failure was isolated to the development fitter. It now
imports the production `canonicalSupportDirections` definition and
`npm run check:stone-support-fit` deterministically regenerates all 24 frozen
recipe distances exactly. The recipe, generated geometry, and six v1 visual
failures are unchanged.

The refreshed nonvisual run passes at 32/32 complete-source scalars, 80/320
triangles, one draw, 1,488/24,576 geometry bytes, and 0.2/5 ms warm p95. The
unchanged Chrome metrics remain mean/worst IoU `0.8931/0.8690`, mean/P95 edge
distance `6.87/23.77 px`, and mean/P95 depth error `0.0290/0.1056`. Ticket 02
is therefore active without any threshold or recipe change.
