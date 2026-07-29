# 01 — Complete-source Object-specific Scalar audit

Type: task
Status: resolved

Implement a deterministic scalar-classification audit covering recipes, generators, generated shader source, and object-specific helpers. Document universal literal exclusions, rerun Stone Path, Stone, Vase, and Umbrella, and fail acceptance when any complete-source count exceeds its frozen ceiling.

Acceptance:

- [x] Object-specific literals outside recipe files are counted.
- [x] Generated shader constants are visible to the audit.
- [x] Exclusions are explicit, stable, and limited to universal algorithm/control-flow literals.
- [x] All four Stage 1 reports contain complete-source evidence.
- [x] Umbrella headroom is not inferred from the historical `86/96` result.
- [x] Unit and integration tests pass.

## Answer

The complete-source audit now counts recipe leaves plus object-specific numeric
literals in generators, generated shader strings, and listed object helpers.
Its frozen universal exclusion set is `[0, 0.01, 0.5, 1, 2, 3, 4]`; every
classification is reported with source line and column evidence.

The corrected results are Stone Path `33/48`, Stone `32/32`, Vase `47/48`, and
Umbrella `94/96`. New evidence is frozen in each object's `nonvisual-v2` report
under `gt_designer/single-mesh-runtime-audit/reports/`. The historical Stage 1
v1 reports remain unchanged.
