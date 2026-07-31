# 04 — Complexity Budget Formula, global ceiling, Budget Proxy

Type: task
Status: resolved
Blocked by: 03

**What to build:** the two constructs that replace human judgement about how compact a reconstruction
should be and how good a compact reconstruction could possibly get.

The formula answers "what budget does this object get" without a human sizing it. The Budget Proxy
answers "what score is reachable at that budget" without a human approving a candidate — it is a
reference-derived construct, so it can be frozen before fitting, which is what keeps automatic
baselines legitimate under the existing calibrate-before-fitting rule.

- [x] The formula maps reference-side complexity measurements — connected component count,
      symmetry-reduced independent part count, material role count, contour curvature complexity — to
      per-unit budgets for scalars, triangles, draw calls, geometry memory, recipe size, gzip delta,
      and warm generation
- [x] Coefficients are back-calibrated on the eight regression units and frozen, with a published
      side-by-side comparison against the eight hand-set budgets
- [x] A single global ceiling is declared that no unit may exceed for any reason
- [x] The formula is applied identically to every unit; no per-object override path exists
- [x] Budget Proxy construction rebuilds the reference at the declared budget, with automatically
      clustered role colours standing in for source texture, and retains nothing
      resolution-dependent
- [x] The proxy is scored through the same L1 stack as a candidate, and its per-metric scores are
      published as that unit's reachability bound
- [x] A frozen JSON report with a `--check` mode records formula coefficients, ceiling, per-unit
      budgets, and per-unit proxy scores

## Resolution

`packages/mesh-to-code/src/budget/` holds the three pieces.

### Complexity measurements

Four reference-side features, all derived from the Authored Reference alone:
welded connected component count, symmetry-reduced independent part count,
material role count, and contour curvature complexity. The contour measure is
`perimeter / (2 * sqrt(pi * area))` over the silhouette — a ratio of two pixel
counts, so it is dimensionless and independent of the resolution it was measured
at, which is what makes it a legitimate retained value. Components are grouped
into independent parts by a placement-invariant descriptor, so five copies of one
mushroom form count as one part rather than five.

Measured on the corpus:

| Unit | Components | Distinct parts | Roles | Contour |
| ---- | ---------: | -------------: | ----: | ------: |
| stone-path | 1 | 1 | 1 | 1.1955 |
| stone | 1 | 1 | 1 | 0.9847 |
| bamboo-shoot | 17 | 14 | 1 | 1.9293 |
| blue-hat | 2 | 2 | 1 | 0.9386 |
| vase | 1 | 1 | 1 | 1.2224 |
| candle | 3 | 3 | 1 | 1.5653 |
| mushroom | 5 | 4 | 1 | 3.2544 |
| umbrella | 76 | 28 | 1 | 1.3764 |

### The formula

`budgetFor(complexity)` takes a complexity measurement and nothing else. There is
no per-object override path, and a test proves it rather than asserting the
signature: passing a complexity record padded with `unitId`, `objectId`, `label`,
`budget`, and `overrides` returns the identical budget.

Coefficients are frozen in `FORMULA_COEFFICIENTS` and back-calibrated by
`node scripts/run-decompiler-budget-calibration.mjs --fit`. Two modelling choices
were forced by the data rather than chosen for elegance, and both are recorded in
the report:

- **The fit is non-negative.** Unconstrained least squares produced large
  opposite-signed pairs — the triangles axis came out `+3612` on component count
  and `-3767` on distinct-part count, because the two features move together.
  Those cancel neatly on the eight calibration points and extrapolate absurdly,
  and a budget that shrinks as an object gains parts is nonsense. Non-negative
  least squares by exhaustive active-set search gives the exact constrained
  optimum for five columns, and a test asserts the resulting monotonicity: raising
  any feature never lowers any budget axis.
- **The link function is `log2`.** The hand-set budgets span 96 to 5,760
  triangles, a ratio of 60, while the transformed features span a ratio of 6. A
  model linear in the budget itself could not hold both ends: it granted Stone
  Path 1,600 triangles against a hand-set 96. Fitting the logarithm makes the
  model multiplicative in complexity, which is how the budgets behave, and makes
  every prediction positive by construction.

`log2MaterialRoles` carries a zero coefficient, and that is a finding rather than
an omission: all eight regression references declare exactly one material, so the
feature has no variance on this corpus and its coefficient is not identifiable
from it. The term stays in the formula and is excluded from the fit with the
reason recorded. Fitting a constant column would have produced a number that looks
calibrated and is not.

A single safety lift of `1.5` is applied identically to every axis and every unit
— the smallest factor keeping each unit's formula budget at or above the
consumption an accepted candidate already has.

### Side-by-side comparison

Triangles axis, formula against hand-set: stone-path 832 / 96, stone 704 / 320,
bamboo-shoot 4,480 / 1,536, blue-hat 896 / 1,536, vase 832 / 1,100, candle
1,472 / 2,048, mushroom 4,928 / 3,840, umbrella 7,872 / 5,760.

Published fit quality, formula over hand-set:

| Axis | Mean | Max | Min |
| ---- | ---: | --: | --: |
| scalars | 1.60x | 2.25x (stone) | 1.00x (candle) |
| recipeBytes | 1.62x | 2.00x (bamboo-shoot) | 1.13x (candle) |
| bundleGzipBytes | 1.58x | 2.00x (bamboo-shoot) | 1.13x (candle) |
| triangles | 2.31x | 8.67x (stone-path) | 0.58x (blue-hat) |
| drawCalls | 1.81x | 2.00x (stone-path) | 1.00x (candle) |
| geometryMemoryBytes | 2.30x | 8.80x (stone-path) | 0.54x (blue-hat) |
| warmGenerationP95Milliseconds | 1.59x | 2.00x (bamboo-shoot) | 1.10x (candle) |

Read honestly: the formula reproduces the hand-set budgets loosely, and most
loosely for the simplest units. With eight calibration points and three
identifiable features the fit is pulled by the larger objects, so a trivially
simple reference is granted several times what a human set for it. It never grants
less than an accepted candidate already consumes and never exceeds the global
ceiling. The consequence to carry forward is that the compactness axis of the
Reconstruction Tier is permissive on simple inputs and the global ceiling is the
real backstop — the extrapolation risk this formula was already known to carry,
now measured.

### Global ceiling

One declared set, which no unit may exceed for any reason: scalars 192, recipe
4,096 bytes, gzip 20,480 bytes, triangles 11,520, draw calls 6, geometry memory
524,288 bytes, warm generation 24 ms. Derived as twice the largest hand-set budget
across the eight units per axis — the eight units are the only calibration data,
so the backstop is twice the most expensive thing ever accepted. `budgetFor`
clamps and reports the clamp rather than letting a formula output through, and a
test drives it with absurd complexity and asserts every axis is clamped. The
complexity gate assigns `full` within the ceiling, `coarse` up to three times it,
and `rejected` beyond with a split recommendation.

### Budget Proxy

Construction is deterministic vertex-cluster decimation of the Authored Reference:
cluster vertices into a cubic lattice, collapse each cell to its member centroid,
drop collapsed triangles, with the lattice chosen by bisection as the finest that
still meets the triangle budget. It retains nothing — the proxy mesh is scored and
discarded, and a test asserts its description carries no pixel-measured value.
Two constructions from the same input agree exactly.

The proxy is scored through the same L1 stack a candidate is scored through: the
CPU rasterizer plus the copied metric functions at the final twelve-view stage.
Automatically clustered role colours substitute for the source texture; L1 scores
geometry only, because a Bounded Semantic Pattern Program executes as a shader, so
the role colours are recorded as part of the construction and no appearance
reachability is claimed.

**The reachability bound is non-binding on all eight units, and that is the
result.** For every unit the formula's triangle budget already holds the whole
reference, so the proxy is the reference and every per-metric bound is exactly
perfect — mean silhouette IoU 1.00000 across the corpus. The reading is that on
this corpus the compactness budget is not what limits geometric fidelity. The
mechanism is implemented and exercised, but it supplies no discriminating
reachability information here, and it will only start to bite where a reference is
dense relative to its budget.

An early version of the construction decimated even when the budget was not
binding, which pushed the bound *below* what is reachable. A reachability bound
has to err upward or it stops being a bound, so a non-binding budget now returns
the reference unchanged and reports `budgetIsBinding: false`.

### Frozen report

`gt_designer/single-mesh-evaluation/reports/decompiler-budget-formula-v1.json`,
written by `node scripts/run-decompiler-budget-calibration.mjs`, with `--check`
recomputing the complexity measurements, budgets, proxy construction, and proxy
scores and requiring an exact match. `--check` additionally fails if the frozen
coefficients stop matching a fresh fit, if any formula budget falls below an
accepted candidate's consumption, or if any budget exceeds the global ceiling. All
four verdicts pass.

Verification block: `npm test` 158 passing / 0 failing; Stone v2 contract PASS;
Patterned Appearance v2 contract PASS; eight-object certification
`PASS under versioned category-specific baselines (8/8)`; rasterizer divergence
`--check` PASS; `node scripts/check-decompiler-package.mjs` PASS (5 checks);
`git status --short` shows no modification to any red-line file.

## Comments

The hand-set budgets and the accepted units' measured consumption are read from
frozen reports only to publish the side-by-side comparison and to size the single
safety lift. Neither sets an acceptance threshold, and no candidate score is read
anywhere in this calibration.
