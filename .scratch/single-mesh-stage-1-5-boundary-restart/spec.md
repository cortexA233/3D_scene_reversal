# Single Mesh Lab Stage 1.5 Stone boundary restart

Status: resolved

## Problem Statement

The original Stage 1.5 specification stopped correctly after Stone's second
compact artifact failed six frozen v1 geometry thresholds. Code review found
that the fitting tool and production generator assigned different normals to
ten support-distance positions, but correcting the fitter regenerated all 24
existing recipe distances exactly and reproduced the v1 failures. The
production candidate remains valid negative evidence; the tool drift was a
Fitting Reproducibility Failure. The product's one-time,
candidate-quarantined rebaseline is now active.

The governing decisions are ADR-0024 through ADR-0026 and the Stone
boundary-review amendment in
`docs/single-mesh-stage-1-5-stage-2-decisions.md`.

## Solution

1. Keep the repaired fitter and regression check that reproduce the existing
   24-distance recipe and unchanged v1 result.
2. Freeze the unchanged candidate and refreshed evidence at the repair commit.
3. Declare and run a reference-only Stone Geometry Baseline v2 Calibration
   Bracket under a deterministic threshold-selection rule.
4. Freeze `stone-geometry-baseline-v2` only if mild and destructive classes
   are separable.
5. Evaluate the unchanged candidate without refitting in Chrome, native
   Firefox, and native Safari, while rerunning all unchanged nonvisual gates.
6. Resume the prior Stage 1.5 sequence at Patterned Appearance Baseline v2
   only if the Stone restart passes.

## Fixed Contracts

- `single-mesh-quality-baseline-v1`, Stage 1 `2/4 FAIL`, and the Stage 1.5
  negative certification are immutable historical evidence.
- Ticket 01 proved the corrected fitter reproduces the unchanged candidate and
  v1 failure, so Tickets 02–04 are active.
- Candidate calibration inputs contain Authored Reference captures and
  perturbations only. Known replacement metrics are never read by threshold
  selection.
- The perturbation manifest, metric policy, threshold-selection rule,
  repeatability allowance, and candidate file hashes freeze before calibration.
- A hard limit is the least-permissive value that contains the complete mild
  envelope plus its repeatability allowance and still rejects every applicable
  destructive control.
- A non-separating metric is replaced or made diagnostic before freeze.
- Stone remains capped at 24 canonical support directions, 32 Object-specific
  Scalars, 1 KB recipe JSON, 4 KB gzip delta, 320 triangles, one draw call,
  24 KB geometry memory, and 5 ms warm-generation p95.
- The candidate may not be refitted, reoriented, or otherwise changed between
  calibration declaration and evaluation.
- Failure permits no second Stone threshold relaxation under this boundary.
- After geometry v2 passes, Stone's v1 appearance thresholds apply to albedo,
  palette, roughness, and metalness. Lit-RGB remains a reported diagnostic
  because its difference is conditioned on geometry normals already accepted
  by v2.

## Required Calibration Bracket

The manifest includes repeated identity captures, the common scale, pivot, and
rotation ladders, and Stone-specific anisotropic-scale, profile-compression,
and support-direction sensitivity ladders. It must also include materially
squashed and sheared forms, low-direction hulls, and simple ellipsoid and box
substitutes as destructive controls. Exact magnitudes and metric-specific
repeatability allowances are ticket outputs declared before calibration runs.

## Acceptance

- A machine-readable candidate-freeze manifest identifies every relevant
  generator, recipe, and evidence hash at the frozen commit.
- A machine-readable v2 calibration report proves identity/mild pass,
  sensitivity ordering, destructive failure, and two-run stability.
- The report records the predeclared selection rule and proves candidate
  metrics were not threshold-selection inputs.
- The unchanged candidate passes the frozen v2 geometry baseline in Chrome and
  two stable full-protocol hardware runs in each of Firefox and Safari.
- The unchanged candidate passes appearance, complete-source scalar, recipe,
  bundle, triangle, draw, memory, generation, determinism, and Reference
  Independence gates.
- A decision report either authorizes resumption at patterned-appearance v2 or
  records a new negative boundary stop without altering any baseline.

## Out of Scope

- Stone recipe, support-direction, or budget changes; the production generator
  may expose its existing direction definition only for the development fitter
  and contract checks;
- Umbrella, Bamboo Shoot, Mushroom, Stage 2, or full-island implementation;
- production textures, source geometry, sampled lookup data, WASM, SDF, CSG,
  modeling DSLs, or new Runtime Kernels;
- another threshold adjustment after the v2 freeze.

## Execution Outcome

Tickets 01–04 pass. The repaired development fitter exactly reproduces the
existing 24 support distances, the reference-only v2 calibration freezes all
eight geometry metrics with ten must-reject controls, and the unchanged Stone
candidate passes Chrome plus two stable native hardware runs in each of
Firefox and Safari. Every nonvisual ceiling and the candidate quarantine pass.

The historical v1 and original Stage 1.5 negative reports remain unchanged.
The boundary-restart certification authorizes Stage 1.5 to resume at Patterned
Appearance Baseline v2 calibration and continues to deny Stage 2 until the
remaining Stage 1.5 gates pass.
