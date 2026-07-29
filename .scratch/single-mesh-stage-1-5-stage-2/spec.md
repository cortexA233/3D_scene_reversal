# Single Mesh Lab Stage 1.5 and Stage 2

Status: wontfix

## Problem Statement

Stage 1 froze a `2/4 FAIL`: Stone Path and Vase pass, Stone's compact loft fails geometry tails, and Umbrella's geometry passes while its compact appearance fails. Firefox and Safari native GPU evidence is absent, and the reported scalar audit counts recipe literals without proving compliance across generators and generated shaders. Formal Single Mesh Lab exit remains blocked.

The accepted product and architectural decisions are recorded in:

- `docs/single-mesh-stage-1-postmortem.md`;
- `docs/single-mesh-stage-1-5-stage-2-decisions.md`;
- ADR-0016 through ADR-0023 for the executed sequence, with ADR-0024 governing
  the separately tracked boundary restart.

## Solution

### Stage 1.5

Execute one strict recovery sequence:

1. Repair complete-source Object-specific Scalar evidence and rerun all Stage 1 objects.
2. Establish full-protocol hardware-accelerated Firefox and Safari visual gates with Stone Path and Vase.
3. Replace Stone's loft with one 24-direction Bounded Support-plane Polyhedron and require a complete v1 pass.
4. Pre-calibrate and freeze patterned-appearance v2 with mild and destructive reference-only controls.
5. Keep Umbrella geometry frozen, replace only appearance with a Bounded Semantic Pattern Program, and require all visual and nonvisual gates.
6. Pre-calibrate and jointly freeze separate Bamboo Shoot and Mushroom baselines and budgets.
7. Certify Stage 1.5. Any red step stops later fitting.

### Stage 2

After Stage 1.5 passes:

1. Build Bamboo Shoot as one tapered asymmetric core plus lateral-sheath and crown-leaf Axial Layer Families. Require complete acceptance before Mushroom begins.
2. Build Mushroom from one shared stem/cap generator and five Repeated Organic Forms. Require complete acceptance.
3. Certify a six-object Versioned Category Exit while preserving the historical Stage 1 v1 `2/4 FAIL`.

## Fixed Contracts

- Stage 1 v1 reports and thresholds remain unchanged.
- New visual values are frozen from reference-only Calibration Brackets before candidate fitting.
- A flat or materially corrupted patterned appearance must fail every applicable patterned baseline.
- Runtime textures, sampled pixels, vectorized bitmaps, source-resolution geometry or appearance arrays, WASM, new CSG/SDF kernels, and unapproved dependencies are prohibited.
- Native GPU evidence requires fresh reference and replacement captures in hardware-accelerated Firefox and Safari, two stable repetitions, complete twelve-view passes, recorded environment metadata, and rejection of software rendering.
- Object-specific numeric choices in recipes, generators, generated shaders, and object-specific helpers count against scalar budgets; only documented universal control-flow/algorithm constants may be excluded.
- Every ticket is a kill gate. `resolved` does not mean `passed`.

## Visual Calibration

Patterned appearance v2 and both Stage 2 baselines use the Calibration Brackets and destructive controls in `docs/single-mesh-stage-1-5-stage-2-decisions.md`. Calibration must emit frozen machine-readable threshold definitions, perturbation results, pass/fail ordering, and explicit evidence that mild and destructive classes remain separable.

If a metric cannot separate those classes, it must be replaced or made diagnostic before fitting. Candidate results may not change a frozen baseline.

## Object Budgets

| Object | Scalars | Recipe | Gzip delta | Triangles | Draws | Geometry | Warm p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Stone | 32 | 1 KB | 4 KB | 320 | 1 | 24 KB | 5 ms |
| Umbrella | 96 | 2 KB | 10 KB | 5,760 | 2 | 256 KB | 12 ms |
| Bamboo Shoot | 64 | 1.5 KB | 6 KB | 1,536 | 2 | 96 KB | 8 ms |
| Mushroom | 96 | 2 KB | 8 KB | 3,840 | 2 | 192 KB | 10 ms |

The six-object bundle remains at most 40 KB gzip excluding Three.js and 40 ms sequential warm generation. Runtime texture and WASM counts remain zero.

## Acceptance

Stage 1.5 passes only when:

- all four Stage 1 objects pass the corrected scalar audit;
- Stone Path and Vase pass native Firefox/Safari visual gates;
- Stone passes complete v1 visual/nonvisual and three-browser gates;
- Umbrella passes unchanged geometry, patterned v2, corrected 96-scalar evidence, and three-browser gates;
- Bamboo Shoot and Mushroom baselines and budgets are frozen before fitting;
- no prohibited production representation or dependency appears.

Formal Single Mesh Lab exit passes only when all six objects pass their declared baseline versions and shared gates. The report says `PASS under versioned category-specific baselines (6/8 required references)` and lists each baseline version without rewriting Stage 1.

## Out of Scope

- full-island reconstruction or complete-island tickets;
- terrain, layout, scatter, structures, animation, collision, or LOD;
- threshold changes derived from candidate failures;
- new runtime geometry kernels, WASM, SDF, CSG, or modeling DSLs.

## Execution Outcome

Tickets 01 and 02 pass. Ticket 03 completes with a frozen negative result: the
second compact Stone representation passes all nonvisual limits but misses six
unchanged v1 geometry thresholds. The specification's kill gate therefore
stops Tickets 04–10 and denies Stage 2 authorization. A new boundary decision
is required before implementation can resume; candidate evidence did not alter
any threshold or historical report.

The boundary review is now accepted in ADR-0024. Continuation is intentionally
tracked as a new, narrow effort under
`.scratch/single-mesh-stage-1-5-boundary-restart/`; this executed specification
remains closed so its negative result and stopped Tickets 04–10 are not
rewritten as though the original v1 gate passed.
