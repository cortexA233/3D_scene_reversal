# Single Mesh Lab Stage 1.5 resumption

Status: resolved
Outcome: FAIL — Umbrella kill gate; Stage 2 not authorized

## Problem Statement

The Stone boundary restart passed under `stone-geometry-baseline-v2`, so the
closed Stage 1.5 negative effort may continue without rewriting it. The next
decision boundary is whether a geometry-frozen Umbrella can recover its hero
pattern as code under a separately calibrated appearance baseline, followed by
reference-only pre-calibration for Bamboo Shoot and Mushroom.

The historical Stage 1 result remains `2/4 FAIL`. Stage 2 remains unauthorized
until this successor effort passes every ticket in order.

The effort stopped at kill gate 2. The frozen-geometry Umbrella candidate
passed geometry and every nonvisual boundary but failed all seven hard
Patterned Appearance Baseline v2 metrics in Chrome. Per the declared execution
order, the Bamboo Shoot/Mushroom pre-calibration and final Stage 1.5
certification tickets did not run.

## Solution

Execute four kill gates:

1. Calibrate and freeze `patterned-appearance-baseline-v2` from the Authored
   Reference only. Select the most permissive thresholds that retain a declared
   guard band between all should-pass controls and every applicable
   must-reject control.
2. Freeze Umbrella geometry and semantic structure, then replace appearance
   only with a Bounded Semantic Pattern Program. Require complete Chrome,
   Firefox, Safari, nonvisual, determinism, and Reference Independence passes.
3. Run separate reference-only Calibration Brackets for Bamboo Shoot and
   Mushroom and freeze both baselines together before either Stage 2 candidate
   is fitted.
4. Certify Stage 1.5. Only a fully green report authorizes a separate Stage 2
   implementation effort.

## Patterned Appearance v2 Contract

Calibration code and data must not import, read, render, hash-select, or inspect
the Umbrella replacement generator, recipe, shader, candidate reports, or
candidate captures. The calibration contract freezes before candidate fitting
and records its own source hash, scenario definitions, metric applicability,
threshold-selection rule, and two independent capture runs.

The should-pass envelope includes identity, repeatability, mild motif position,
phase, scale, layout, and palette changes. The must-reject set includes:

- a flat canopy;
- a wrong dominant palette;
- deletion of each major flower, leaf, and branch family;
- 50% pattern-coverage loss;
- large phase error;
- large pattern-scale error.

Complex texture is intentionally allowed substantially more error than the v1
Umbrella thresholds. Threshold selection is permissive, not candidate-shaped:
each hard metric uses the loosest value that remains on the acceptable side of
the nearest applicable destructive control by the predeclared guard band. A
metric that cannot separate its declared controls becomes diagnostic or is
replaced before freeze. Candidate evidence cannot alter the result.

The gate remains falsifiable: every destructive scenario must fail at least one
predeclared applicable hard metric, and every should-pass scenario must pass the
complete hard gate.

## Umbrella Appearance Boundary

The already-passing radial geometry, Reconstruction Frame, semantic hierarchy,
and two-render-batch construction freeze before appearance fitting. The
candidate may use semantic canopy coordinates, analytic flower/leaf/branch/
border motifs, fixed-cap compact vector or Bezier controls, layering, symmetry,
repetition, and domain transforms.

Production remains prohibited from using textures, `DataTexture`, pixels,
sampled grids, lookup images, quantized image payloads, resolution-scaled vector
paths, vectorized bitmaps, or sampled appearance hidden in arrays, shader source,
or helper constants. Every object-specific geometry or appearance number counts
under the complete-source 96-scalar ceiling.

The unchanged Umbrella budgets remain 2 KB recipe JSON, 10 KB gzip production
delta, 5,760 triangles, two draw calls, 256 KB geometry memory, and 12 ms warm
generation p95. Geometry continues to use its unchanged v1 thresholds;
appearance alone uses patterned v2.

## Stage 2 Pre-calibration Boundary

Bamboo Shoot and Mushroom receive separate Category-specific Quality Baselines
and separate fixed budgets from ADR-0020. Their reference-only brackets use the
common transform ladders and object-specific mild, intermediate, severe, and
destructive controls accepted in
`docs/single-mesh-stage-1-5-stage-2-decisions.md`.

Both contracts freeze in one certification operation, but their numeric values,
metric applicability, and later pass/fail outcomes remain independent. Neither
production generator, recipe, candidate report, nor candidate capture may exist
before both baselines are frozen.

## Acceptance

Stage 1.5 passes only when:

- patterned appearance v2 passes its complete reference-only calibration
  contract and is frozen before candidate fitting;
- Umbrella passes unchanged geometry, patterned appearance v2, complete-source
  scalar and nonvisual budgets, determinism, Reference Independence, and two
  stable hardware-GPU runs in Chrome, Firefox, and Safari;
- Stone Path, Stone, and Vase retain their already-qualified evidence;
- Bamboo Shoot and Mushroom baselines and budgets are frozen together before
  either Stage 2 candidate is fitted;
- no prohibited production representation or dependency is present;
- the certification preserves Stage 1 v1 as `2/4 FAIL` and reports Stage 1.5
  only under explicit versioned baselines.

## Out of Scope

- Bamboo Shoot or Mushroom production implementation in this effort;
- full-island reconstruction or complete-island tickets;
- terrain, layout, scatter, buildings, animation, collision, or LOD;
- any change to historical v1 reports or numeric thresholds;
- candidate-derived threshold changes after a baseline freeze;
- a new Runtime Kernel, CSG, SDF, WASM, modeling DSL, or dependency.
