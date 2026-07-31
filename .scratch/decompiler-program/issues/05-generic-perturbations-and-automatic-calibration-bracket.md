# 05 — Generic perturbation manifest and automatic Calibration Bracket

Type: task
Status: resolved
Blocked by: 04

**What to build:** automatic generation of a unit's acceptance baseline from the reference alone,
frozen before any candidate is fitted.

The existing perturbation helpers are half generic and half object-specific, and the manifests
themselves were written by hand per object. This ticket makes both generic, and makes metric
eligibility a computed verdict rather than a human call: a metric that cannot separate mild
perturbations from destructive controls becomes diagnostic instead of being loosened. That rule is
already written policy; here it becomes executable.

- [x] The perturbation manifest is generated from the mesh alone: scale, pivot, and rotation ladders
      as mild controls; component deletion, family reduction, structural collapse, resolution
      quantization, appearance flattening, and palette corruption as destructive controls
- [x] The bracket runs reference-only, with no candidate present
- [x] Per-metric eligibility is computed: mild-pass plus destructive-fail makes a metric hard;
      inability to separate makes it diagnostic
- [x] The frozen baseline combines computed eligibility with the Budget Proxy reachability bound from
      ticket 04
- [x] The baseline is written before any fitting call can execute, enforced structurally rather than
      by convention
- [x] No code path can loosen a threshold after fitting has begun
- [x] A report compares the automatic verdicts against the eight units' existing frozen baseline
      verdicts and explains every divergence rather than tuning it away
- [x] Frozen JSON report with a `--check` mode

## Resolution

`packages/mesh-to-code/src/baseline/` holds the manifest generator, the bracket,
and the freeze gate.

### The generic manifest

Nineteen controls, generated from the mesh alone with no per-object manifest
authored anywhere. Mild: uniform scale at 0.5% and 1%, pivot shift at 0.4% and
0.8% of the longest dimension, and rotation about y and x at 1 and 2.5 degrees,
across mild and intermediate rungs. Destructive: uniform scale at plus and minus
5%, anisotropic x at 110%, squash y at 80%, pivot shift at 10%, component
deletion, family reduction, structural collapse to the bounding box, radial
quantization to six segments, appearance flattening, and palette corruption.

Component deletion, family reduction, and radial quantization call the vendored
helpers rather than reimplementing them, so the automatic manifest damages a
reference by exactly the strategies the frozen hand-written calibrations used.

A control the mesh cannot support is recorded with a reason and never dropped:
`reduce-family` is inapplicable to six of the eight units, and `delete-component`
to the three single-component units. A vendored helper that refuses a mesh — for
instance because no non-dominant family reaches the requested 20% of surface area,
which is candle's case — is caught and recorded the same way rather than crashing
the run.

### Per-metric responsibility, and a wrong turn that was corrected

A destructive control names the metrics responsible for rejecting it; a mild
control must be tolerated by every geometry metric.

The first implementation pooled controls into metric groups instead, and it was
wrong in a way worth recording. Uniform scaling about the bottom centre leaves the
bottom anchor exactly where it was, and a pivot shift leaves every extent exactly
as it was — so each bounds metric is blind to one control by construction. Pooling
made the destructive boundary for `bounds.bottomAnchorErrorCanonical` come out at
`0.00000`, and every bounds and depth metric was demoted to diagnostic for a reason
that was an artefact of the pooling rather than a property of the metric. The
frozen hand-written baselines name their destructive scenarios per threshold for
exactly this reason.

### Computed eligibility

The bracket scores the reference against itself and against every applicable
variant, then per metric takes the mild envelope as the worst a mild perturbation
gets and the destructive boundary as the best a destructive control gets. Hard when
they do not overlap, with the threshold placed at the mild envelope relaxed by a
0.25 guard fraction toward the destructive boundary; diagnostic when they do, with
the threshold left `null`. A metric is never loosened until both pass.

Appearance controls are generated so the manifest is complete and name no geometry
metric, because they leave geometry untouched. No appearance metric is declared
hard or diagnostic: the L1 stack scores geometry only.

### Structural enforcement

`requireFrozenBaseline` is the only way to begin fitting. It accepts a handle
produced by `freezeBaseline` and checks its identity against a module-private
`WeakSet`, so a plain object with the right shape is refused and there is no
overload or flag that skips the check. The frozen record is deeply immutable —
tests assert that assigning a threshold, replacing a metric entry, or rewriting the
version all throw `TypeError` after fitting has started. Calibrate-before-fitting
is therefore a property of the type, not something review has to catch.
`freezeBaseline` also refuses a bracket whose `candidatePresent` is not `false`.

The Budget Proxy bound from ticket 04 is combined in at freeze time. A bound that
fails a threshold is recorded as a signal that the budget formula or the Operator
Library is inadequate, and the threshold is not relaxed.

### The finding

`gt_designer/single-mesh-evaluation/reports/decompiler-automatic-baseline-v1.json`
records 31 divergences from the frozen baselines: 21 diagnostic demotions and
**10 cases across four units where the automatic threshold rejects an
already-accepted candidate.**

| Unit | Hard metrics | Divergences |
| ---- | -----------: | ----------: |
| stone-path | 5/8 | 3 |
| stone | 8/8 | 6 |
| bamboo-shoot | 2/8 | 6 |
| blue-hat | 2/8 | 6 |
| vase | 8/8 | 0 |
| candle | 8/8 | 0 |
| mushroom | 6/8 | 6 |
| umbrella | 4/8 | 4 |

The mechanism is clear from the numbers. The bracket calibrates the interval
between a barely-perturbed reference and a damaged reference, and a compact
Procedural Replacement is not inside that interval. Stone's accepted candidate
scores mean silhouette IoU `0.89308` while the best destructive control on that
metric scores `0.92440` — the candidate is further from the reference than the
declared damage is. Mushroom is the same shape of result, `0.83110` against
`0.86222`. The frozen human-anchored thresholds for those units sit far looser at
`0.84470` and `0.82000` precisely because a human supplied the reachability
estimate a reference cannot.

The Budget Proxy exists to supply that estimate without a human, and on this
corpus it cannot: ticket 04 found every unit's triangle budget already holds its
whole reference, so the proxy is the reference, its bound is perfect, and it
relaxes nothing. The mitigation is implemented and does not bite here.

The 21 demotions are genuine non-separability rather than thresholds needing
loosening. On a many-component reference a 2.5-degree rotation can cost more
silhouette agreement than deleting a component does, so the envelope and the
boundary overlap and the rule demotes the metric. bamboo-shoot and blue-hat lose
six of eight metrics that way.

Nothing was tuned away. No ladder rung, guard fraction, or threshold was adjusted
in response to any of this — loosening a reference-derived threshold to admit a
candidate is the exact move the calibrate-before-fitting rule exists to prevent.

**What this does and does not block.** Phase B's exit is measured under each unit's
existing frozen baseline version, not under this automatic baseline, so it is not
blocked. What this bears on is Phase C and any new unit: an automatic
reference-only baseline will be unreachably strict for a compact reconstruction
unless the Budget Proxy binds. The reachability side of the automatic acceptance
story is the open problem; the eligibility side works.

Verification block: `npm test` 167 passing / 0 failing; Stone v2 contract PASS;
Patterned Appearance v2 contract PASS; eight-object certification
`PASS under versioned category-specific baselines (8/8)`; automatic baseline
`--check` PASS; `node scripts/check-decompiler-package.mjs` PASS (5 checks);
`git status --short` shows no modification to any red-line file.
