# Decompiler Program — implementation handoff

Branch: `claude/decompiler-program-impl-102f84` (worktree). Never pushed, never
merged, never rebased.

Scope of this run: tickets 01 → 06 in order. Ticket 07 and later are untouched.

## Ticket status

| Ticket | Status |
| ------ | ------ |
| 01 package skeleton, decision protocol, mock decider | resolved |
| 02 measurement core copied with drift checks | resolved |
| 03 CPU rasterizer, divergence tolerance, wall-clock | resolved |
| 04 Complexity Budget Formula, global ceiling, Budget Proxy | resolved |
| 05 generic perturbations, automatic Calibration Bracket | resolved |
| 06 end-to-end geometry reconstruction | resolved |

**All six tickets in this run's scope are resolved.** Ticket 07 and later are
untouched and unclaimed.

Commits, one per ticket:

| Ticket | Commit |
| ------ | ------ |
| 01 | `de7b2d9` |
| 02 | `3263800` |
| 03 | `daa21f8` |
| 04 | `214d8f2` |
| 05 | `7e58b17` |
| 06 | `963af8f` |

A hash cannot be written inside the commit it names, so each ticket's hash lands
in the following ticket's commit. If this table is one row short of the resolved
ticket list, the missing hash is the current `HEAD`.

## Ticket 03 judgement gate — PASSED, continuing to ticket 04

Read from my own frozen report,
`gt_designer/single-mesh-evaluation/reports/decompiler-rasterizer-divergence-v1.json`.

**Divergence versus discrimination margin.** The margin is defined as the
smallest distance, across the eight units, between an accepted candidate's
browser-measured aggregate and the hard threshold it was accepted under — a
divergence larger than that could flip an accepted verdict. The frozen tolerance
is the observed maximum divergence times a 1.5 guard factor, rounded up to three
significant digits.

| Metric | Max divergence | Frozen tolerance | Margin | Tolerance / margin |
| ------ | -------------: | ---------------: | -----: | -----------------: |
| `bounds.maxAxisRelativeError` | 3.883e-15 | 5.830e-15 | 1.324e-2 | 0.0000 |
| `bounds.bottomAnchorErrorCanonical` | 3.794e-15 | 5.700e-15 | 1.158e-2 | 0.0000 |
| `silhouette.meanIou` | 2.710e-4 | 4.070e-4 | 1.110e-2 | 0.0367 |
| `silhouette.worstViewIou` | 6.176e-4 | 9.270e-4 | 1.453e-2 | 0.0638 |
| `silhouette.meanEdgeDistancePixels` | 6.329e-3 | 9.500e-3 | 2.397e-1 | 0.0396 |
| `silhouette.edgeDistanceP95Pixels` | 2.861e-1 | 4.300e-1 | 1.113e+0 | 0.3863 |
| `depth.mae` | 3.741e-5 | 5.620e-5 | 4.243e-3 | 0.0132 |
| `depth.p95` | 0.000e+0 | 0.000e+0 | 7.413e-3 | 0.0000 |

Every tolerance is below its margin. The worst case is
`silhouette.edgeDistanceP95Pixels` at 38.6% of margin; every other metric is
under 7%. Independently of the margin arithmetic: for all eight units across all
eight metrics, the pass-or-fail verdict computed from CPU buffers equals the
verdict computed from the browser's, so on the whole regression corpus the CPU
ruler never flips an accepted unit.

**Wall-clock versus declared budget.** The budget was declared before measuring
and derived from the search shape: K≈3 candidates × R≈3 rounds × 40 iterations =
360 coarse scores per unit.

| Measure | Budget | Measured maximum | Factor |
| ------- | -----: | ---------------: | -----: |
| Coarse-stage fitting iteration | 150 ms | 17.0 ms (umbrella) | 0.11× |
| Final twelve-view score | 2,000 ms | 753 ms (blue-hat) | 0.38× |
| Per unit | 600,000 ms | 838 ms (blue-hat) | 0.001× |

Per-unit coarse-iteration means, in ms: stone-path 12.0, stone 13.7,
bamboo-shoot 10.9, blue-hat 16.5, vase 14.7, candle 12.7, mushroom 13.4,
umbrella 17.0. Nothing is over budget, so no factor-of-overrun needs reporting.
Measured on Node `v24.11.0` / `win32` / `x64`.

**Decision: continue to ticket 04.** Neither stop condition fires. Divergence is
between 0 and 39% of the margin the fitting loop needs, and wall-clock is between
0.1% and 38% of the declared budget — under, not over, so this is not a case of
working around backend evidence.

**Byte stability:** two runs identical and the serial path identical to the
worker-thread path, on all eight units, verified by sha256 over every buffer.

## Verification block, current state

```
npm test                                                    176 passing / 0 failing
npm run check:stone-v2-contract                             PASS (6 candidate, 3 evidence files)
npm run check:patterned-appearance-v2-contract              PASS
node scripts/run-stage-2-eight-object-certification.mjs --check
                                                            PASS under versioned category-specific baselines (8/8)
git status --short                                          no red-line file modified
```

Baseline before any work: `npm test` was 92 passing / 0 failing. The package's own
21 tests live in `packages/mesh-to-code/test/` and are discovered by the
repository's `node --test` as well as by the package's own runner, which is why
the count rose. The package suite is 84 tests after ticket 06, and the
repository's own count is unchanged at 92: 92 + 84 = 176. Both suites pass
standalone. The package suite takes about 50 seconds, because several cases drive
the whole pipeline as a subprocess.

Repository-side aggregator, all passing (5 checks):

```
node scripts/check-decompiler-package.mjs        (relative path only, never a workspace)
node scripts/check-decompiler-measurement-drift.mjs
node scripts/run-decompiler-rasterizer-calibration.mjs --check   (needs the LFS reference)
node scripts/run-decompiler-budget-calibration.mjs --check       (needs the LFS reference)
node scripts/run-decompiler-baseline-calibration.mjs --check     (needs the LFS reference)
cd packages/mesh-to-code && npm test
cd packages/mesh-to-code && npm run check:neutrality
cd packages/mesh-to-code && npm run check:package-contents
cd packages/mesh-to-code && npm run check:pack-install-run
```

## Ticket 06 milestone, measured

One command on a code-generated lathe-able fixture, at the complete twelve-view
512-pixel protocol: tier `below-gate`, geometry gate **passed** with 8 of 8 metrics
hard and 0 diagnostic, mean silhouette IoU `0.99002`, worst-view `0.98962`, edge P95
`2` pixels, depth MAE `0.00486`, 768 triangles against a 768 budget, 36
Object-specific Scalars against 80. All five contract constraints pass or are
recorded not-applicable with a reason. The inline output hashes identically to the
library-importing output.

`below-gate` rather than `accepted` is the correct answer, not a shortfall:
`accepted` means every hard gate passed, and appearance is a hard gate axis this
build does not measure. It is recorded `evaluated: false` with a reason and named in
the tier rationale.

This is also a useful counterweight to the ticket 05 finding below. Where the
operator genuinely matches the reference's shape family, the same automatic
reference-only baseline is cleared with nothing demoted — the ticket 05 problem is
about compact approximation of complex references, not about the bracket rule.

## Things worth knowing

**The root `package.json` cannot gain a `check:*` script.** It is a frozen
candidate file in both calibration contracts, which also assert
`git diff --quiet HEAD` over their lists. So every repository-side entry point
this program adds is a plain `scripts/*.mjs` invoked as
`node scripts/<name>.mjs [--check]`, never an npm script. The spec's phrasing
"`run-*.mjs` plus `--check` plus frozen JSON report plus `check:*` script pattern"
therefore holds except for the npm-script half. Tickets 03–05 only require
`--check` plus a frozen JSON report, so nothing in this run is blocked; tickets
13–15 should be read with this constraint in mind.

**`--inline` is implemented without esbuild.** Brief decision 16 says `--inline`
produces an "esbuild-treeshaken self-contained single file". esbuild ships
platform-specific prebuilt Go binaries, and red line 5 of this run's instructions
is "No native dependencies … Pure JavaScript only", stated as a hard
cross-agent-neutrality requirement. Red line 5 takes precedence, so inline
emission inlines the recipe and exactly the operators the composition uses, with
nothing it does not use carried, and `three` stays external in both modes. The
observable contract — one self-contained file whose geometry matches the
library-importing output — is met, and the package keeps zero dependencies.
**This is a flagged deviation for review.** If esbuild is wanted, ticket 12 is
the place, and it needs an explicit exemption from red line 5.

**The emitted generator does not import `three`.** `createObject3D(THREE, recipe)`
takes the namespace as an argument. This keeps `three` a real peer dependency,
lets the contract audit execute emitted code in any directory, and leaves
`buildParts(recipe)` a pure positions-and-indices function that the ticket 03
rasterizer can score without a renderer.

**Spec and brief use "Stage 3a/3b/3c" in places** (spec lines 226 and 272; brief
staged-exit table) where this program's phases are Phase A / B / C. Nothing was
amended. Code, commits, reports, and tickets in this run say Phase A / B / C only.

**The eight-object certification does not depend on `node_modules` being fresh.**
`node_modules` was absent at the start of this run and was installed with
`npm ci`. The root lockfile hash is unchanged:
`196401e3ca0ede3e31f80ccacbed2132eb55f6459dbadfb230963a989d337193`.

**The vendored measurement copies carry object-specific symbols on purpose.**
Byte-identity with `tools/evaluation/visual-metrics.mjs` means the copy contains
`evaluateQualityGate`, and byte-identity with `calibration-perturbations.mjs`
means it contains the Stone-specific constructors. The alternative was editing a
frozen file. They are not re-exported, `OBJECT_SPECIFIC_EXPORTS_WITHHELD` names
them, and a test asserts they stay unreachable. Ticket 02's two checkboxes are in
literal tension here; the resolution and the reasoning are recorded in that
ticket.

**`tools/evaluation/patterned-appearance-metrics.mjs` was not copied.** Its
`HUMAN_ANCHORED_PATTERN_ROLES_V3` is one unit's declared motif palette, which is
object-specific baseline material, and semantic-pattern appearance belongs to
ticket 10.

**The evaluation frame silently re-anchors a generated root.** The harness's
frame assigns `root.position` from the replacement transform's
`translationBeforeScale`, which is always the origin, so a generator that
positions its own root is measured at the origin regardless. Mushroom is the one
unit where this bites: its root carries `y = -0.019646`. Reproducing the overwrite
was required to make the analytic bounds metric agree with the frozen numbers, and
it turned a FAIL into 3.794e-15. Any later emission path must not rely on root
placement to position a unit. Found during ticket 03; details in that ticket.

**THE HEADLINE FINDING OF THIS RUN, from ticket 05.** An automatic reference-only
Calibration Bracket produces geometry thresholds that four of the eight
already-accepted candidates cannot meet — 10 metric rejections across stone and
mushroom — and demotes 21 of 64 metric slots to diagnostic.

The mechanism: the bracket calibrates the interval between a barely-perturbed
reference and a damaged reference, and a compact Procedural Replacement is not
inside that interval. Stone's accepted candidate scores mean silhouette IoU
`0.89308` while the best destructive control on that metric scores `0.92440` — the
candidate is further from the reference than the declared damage is. Mushroom:
`0.83110` against `0.86222`. The frozen human-anchored thresholds sit at `0.84470`
and `0.82000` precisely because a human supplied the reachability estimate a
reference cannot.

The Budget Proxy is the designed replacement for that human estimate, and on this
corpus it cannot supply it: every unit's triangle budget already holds its whole
reference, so the proxy is the reference and its bound is perfect. The mitigation
is implemented and does not bite.

Nothing was tuned away, and nothing should be. Phase B is not blocked, because its
exit is measured under each unit's existing frozen baseline version rather than
under the automatic one. What this bears on is Phase C and any new unit: the
eligibility half of automatic acceptance works, and the reachability half is the
open problem. Full numbers in the ticket 05 resolution and in
`decompiler-automatic-baseline-v1.json`.

**Two further Phase A findings.**
First, the Budget Proxy reachability bound is non-binding on all eight regression
units: the formula's triangle budget already holds each whole reference, so every
per-metric bound is exactly perfect and the proxy supplies no discriminating
reachability information on this corpus. The mechanism works; the corpus does not
exercise it. Second, the Complexity Budget Formula over-grants the simplest units
by up to 8.7x relative to the hand-set budgets, so the compactness axis of the
tier is permissive on simple inputs and the global ceiling is the real backstop.
Both are recorded in the ticket 04 resolution and in
`decompiler-budget-formula-v1.json`.

**The divergence `--check` is not a CI job.** It reads the 69 MB Authored
Reference, which is Git LFS content, so it sits with the other
reference-dependent calibrations that run on hardware. The rasterizer's own
behaviour is covered by ten package tests that need no reference asset.

**`dev/` was already untracked before this run started** and is not this work.

**`.github/` did not exist.** Ticket 01 requires CI to run the pipeline with the
mock decider in a harness-free environment and to pack-install-run the package,
so `.github/workflows/decompiler-program.yml` is new. Every step in it invokes a
script that also runs locally, and all of them were run locally and pass — the
workflow file is not standing in for unverified evidence.

**Input formats.** Only Wavefront OBJ is decoded. The glTF/GLB, PLY, and STL arms
of the input contract are declared and classified `format-not-implemented` rather
than silently mishandled. No ticket in 01–06 requires them: fixtures are
code-generated OBJ, and ticket 03's calibration reads the reference GLB on the
repository side, where `@gltf-transform` already exists, and injects geometry
into the package by array.

**The profile-lathe operator places geometry on its own axis at the origin.** A
semantic group that is off-centre within its unit is therefore reconstructed in the
wrong place. That is in scope for ticket 06's declared one-operator, one-component
path; multi-group placement belongs to the decomposition and multi-unit composition
ticket. Until then a multi-group input fits badly and fails its gate, which is
visible rather than silent.

**`--baseline-stage` exists for speed and defaults to `final`.** The Calibration
Bracket scores every declared control, so the full protocol costs seconds per
invocation. The package suite uses `coarse` for most cases and `final` for the
milestone case, so the headline numbers are measured under real evaluation
conditions.

## Where ticket 07 picks up

Nothing is left claimed or half-built. Tickets 07–16 are untouched.

Two things ticket 07 should know. The Operator Library holds exactly one operator
and `admitAuthoredOperator` already requires the recorded coverage failure, so
seeding more operators is additive. And the escape-hatch path is live: authoring
unlocks on a measured geometry-gate failure and a non-conformant authored operator
already reaches the audit and withholds emission, so a real seeded operator can be
dropped in without new plumbing.

## Open questions

Two flagged for review, neither blocking:

1. **The esbuild deviation** described above — `--inline` is dependency-free rather
   than esbuild-treeshaken, because red line 5 forbids non-pure-JavaScript
   dependencies and brief decision 16 asks for esbuild. Red line 5 was taken as
   controlling.
2. **The reachability half of automatic acceptance is unsolved**, per the ticket 05
   finding. This is the one that matters. The Budget Proxy is the designed answer and
   it does not bite on this corpus. Somebody has to decide what supplies the
   reachability bound for a new unit before Phase C can mean anything, and no ADR
   currently answers it.
