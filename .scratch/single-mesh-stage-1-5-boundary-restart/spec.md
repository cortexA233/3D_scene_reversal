# Single Mesh Lab Stage 1.5 Stone boundary restart

Status: ready-for-agent

## Problem Statement

The original Stage 1.5 specification stopped correctly after Stone's second
compact artifact failed six frozen v1 geometry thresholds. Code review then
found that the fitting tool and production generator assign different normals
to ten support-distance positions. The artifact passes every nonvisual budget,
but this Representation Contract Failure prevents it from proving that the
representation failed. The contract must be repaired and v1 rerun before the
product's one-time, candidate-quarantined rebaseline may activate.

The governing decisions are ADR-0024, ADR-0025, and the Stone boundary-review
amendment in `docs/single-mesh-stage-1-5-stage-2-decisions.md`.

## Solution

1. Make the development fitter consume the production canonical-direction
   definition, refit only the existing 24 distances, and rerun all unchanged
   v1 gates.
2. If v1 still fails, freeze the corrected candidate and evidence at the
   repair commit.
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
- A v1 pass by the contract-corrected candidate cancels Tickets 02–04 and
  resumes Stage 1.5 without creating a Stone v2 baseline.
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

- Stone generator, recipe, support-direction, or budget changes other than
  making the fitter consume the already
  frozen production definition, and recipe changes other than refitting the
  same 24 support distances during Ticket 01;
- Umbrella, Bamboo Shoot, Mushroom, Stage 2, or full-island implementation;
- production textures, source geometry, sampled lookup data, WASM, SDF, CSG,
  modeling DSLs, or new Runtime Kernels;
- another threshold adjustment after the v2 freeze.
