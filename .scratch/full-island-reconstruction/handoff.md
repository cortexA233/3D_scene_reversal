# Full Island Reconstruction — handoff

Authority for a fresh session: this file, `spec.md`, the relevant ticket under
`issues/`, `CONTEXT.md`, and ADR-0036 through ADR-0050.

## Where the work stands

Branch `experiment/claude-full-island-scene`.

Scene Parity Foundation is complete and certified. `foundation=PASS` with
`candidate=RED`, which is the milestone's intended result.

| Ticket | State |
| --- | --- |
| Foundation 01-12 | done, certified |
| Camera-set v2 migration (ADR-0049, ADR-0050) | done |
| Reconstruction 08 — vegetation canopies | done |
| Reconstruction 01-07, 09-16 | ready-for-agent |

## Environment

Every browser command needs these, because the harness looks for Chrome at
Unix paths and calls `python3`:

```bash
export CHROME_BIN="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
export PYTHON_BIN="python"
```

The authoritative observation host is `windows-edge-150-swiftshader-subzero`,
migrated from `macos-chrome-150-swiftshader-llvm-10-0-0` by ADR-0050 because no
macOS host is available and only the authoritative host may re-freeze a camera
set. Superseded profiles are preserved verbatim under
`.scratch/scene-parity-foundation/evidence/superseded/`.

Firefox and Safari are not installed. Their native GPU gates are real blockers,
already recorded in the certification's `deferred` list.

## The camera-set blind spot, resolved

Five of the six frozen cameras could not see the island. Measured from frozen
evidence, not estimated:

- The four obliques stood 5727 units from their target and the top-down camera
  4080 units above it, while the reference's linear fog ends at 3500. All five
  recorded the fog colour `0xe6dcc2`.
- The obliques also stood at normalised cloud-shell radius 0.68 to 0.94, inside
  a sprite population that begins at 0.2539 in a band reaching `y=3174.86`. An
  earlier version of this file recorded the band as `y≈500-2600`, understating
  the top by ~575 units, which is what made the obliques look merely low rather
  than embedded.
- Island content filled 10.10 per cent of the authored overview and 0.10 to 0.31
  per cent of the five auxiliary frames. `paths` had zero reference pixels on
  `oblique-north`; `wildlife` had zero on `oblique-east` and `oblique-south`.

Root cause: `deriveReferenceCameraSet` framed the full authored bounds, 2982 by
3365 units, dominated by the 16 horizon ridges at 1400 to 1880 units while the
island reaches 280. At 58 degrees that forces 4868 units of standoff, which
cannot fit inside fog far 3500.

ADR-0049 reframes the auxiliary cameras on the island subject: the Scene Recipe's
entities minus the `horizon` group. The 1.15, 1.2, and 0.62 margin constants are
unchanged; only the volume they apply to changed. No threshold was touched.

Result, all frozen in `tools/reference/baselines/reference-camera-set-v2.json`:

| | before | after | limit |
| --- | --- | --- | --- |
| topDown y | 4106.26 | 622.29 | — |
| oblique y | 3127.12 | 550.90 | — |
| farthest subject corner | 5846-6178 | <=1240 | 2800 |
| cloud shell radius | 0.685-0.940 | <=0.185 | 0.25 |
| island share of frame | 0.10-0.31% | 4.05-16.21% | — |
| groups at zero pixels | 3 | 0 | 0 |

The gate is `node --test test/reference-camera-framing.test.mjs`, 11 assertions,
green. Two of them exist to show the criteria are not arbitrary: the authored
overview satisfies them, and a camera displaced 4000 units fails both.

### What the migration proved about the metrics

The honest metrics got worse, which is what should happen when cameras stop
measuring fog:

| metric | v1 | v2 |
| --- | --- | --- |
| depth p95 mean | 50.72 | 141.92 |
| world normal p95 mean | 25.57 deg | 71.22 deg |
| appearance mean DeltaE | 15.41 | 26.17 |
| per-group silhouette IoU | 0.388 | 0.422 |
| whole-frame silhouette IoU | 0.900 | 0.994 |

**Whole-frame silhouette IoU is not island evidence.** Geography fills 84 to 86
per cent of every auxiliary frame, so 0.994 is ground agreeing with ground while
per-group IoU is 0.422. Ticket 01 must calibrate the fixed-camera layer on
per-group metrics. `test/reference-camera-framing.test.mjs` asserts this
domination so it cannot be quietly gated later.

## Commands

```bash
npm test                              # 200 tests
npm run check:scene-foundation-reconciliation
npm run check:reference-observation   # two full browser observations, slow
npm run check:scene-coverage
npm run check:scene-correspondence
npm run check:geography
npm run check:horizon
npm run check:scene-generation
npm run check:scene-calibration
npm run check:vegetation
npm run report:scene-parity           # exits 1 while the candidate is red
npm run certify:scene-parity-foundation
node --test test/reference-camera-framing.test.mjs
```

Measurement, which rewrites the evidence files:

```bash
npm run observe:reference             # browser; writes the camera set baseline
npm run measure:scene-coverage
node scripts/run-scene-passes.mjs     # browser, six cameras, several minutes
npm run measure:scene-correspondence
npm run measure:geography             # consumes the camera set for frusta
npm run measure:horizon               # does NOT consume the auxiliary cameras
npm run calibrate:scene
npm run fit:tracer
```

Run the browser gates one at a time. Chained together they exceed ten minutes
and get killed.

## Re-measurement order when the camera set changes

1. `npm run observe:reference` — freezes the camera set baseline
2. `node scripts/run-scene-passes.mjs` — six cameras, must be re-captured
3. `npm run measure:geography` — frustum coverage depends on the cameras
4. `npm run calibrate:scene`
5. `npm run report:scene-parity`
6. `npm run certify:scene-parity-foundation`

`measure:horizon` is unaffected: it reads only
`recipe.environment.camera.position`.

## Current candidate result

```
structuralCorrespondence  pass
worldGeometry             fail
fixedCameraGeometry       blocked — no calibrated thresholds
nativeAppearance          blocked — geometry must pass first
```

World layout is exact and must stay that way: anchor, Target AABB Extent, typed
orientation, neighbourhood distance, zone occupancy, and overview overlap
ordering all report zero error across all 672 entities.

Failing world-geometry metrics, from the freshly regenerated
`scene-parity-report-v1.json`:

| metric | value | threshold |
| --- | --- | --- |
| surface p95 mean | 9.872 | 2.3479 |
| worst entity surface p95 | 165.6694 | 13.758675 |
| over-tolerance surface fraction | 0.6018 | 0.11835 |
| worst component deficit | 9 | 3.5 |
| terrain height p95 | 16.2617 | 5.26875 |
| shore height p95 | 12.4923 | 2.85035 |
| land and sea agreement | 0.903491 | 0.931361 |
| horizon profile p95 | 0.098887 | 0.0165 |
| worst azimuth horizon error | 0.124982 | 0.0165 |

Take these numbers from `scene-parity-report-v1.json` or
`scene-correspondence-v1.json`, not from a certification written before the last
correspondence measurement. Surface p95 mean is 9.872; an intermediate
certification recorded 11.1851 from an older run.

## Next steps

### Ticket 01, in progress — calibrate the two missing layers

The red check exists and is red: `node --test test/camera-appearance-calibration.test.mjs`,
8 assertions, 5 red and 3 green. The three green ones are well-formedness and the
vacuous-pass control, so they stay green throughout. Supporting declaration is
`tools/acceptance/camera-appearance-layers.mjs`.

Red evidence, which enumerates the remaining work:

1. `fixedCameraGeometry` and `nativeAppearance` hold no thresholds.
   `run-scene-calibration.mjs` hard-codes both as `[]` at lines 369-370.
2. `fixedCameraGeometry` leaves six metric families ungated: per-group
   silhouette, contour distance, linear depth, world normal, semantic occupancy,
   semantic confusion.
3. Three evidence paths are not measured at all and must be added to
   `tools/evaluation/browser-scene-passes.mjs`, after which the passes must be
   re-captured: `aggregate.semanticConfusion.worstFraction`,
   `aggregate.appearanceByMaterialFamily.meanMean`,
   `aggregate.appearanceByMaterialFamily.worst.value`.
4. Appearance is measured per semantic *group* in `view.appearance.regions`, not
   per Material Family. The recipe declares 10 families — distant-rock,
   painted-timber, paving-stone, shore-rock, palm-foliage, blossom-foliage,
   bamboo-foliage, terrain-ground, ocean-surface, creature-fur — and zero are
   measured. The ticket requires per-Material-Family appearance.

Order to finish it:

1. Extend `browser-scene-passes.mjs` with per-Material-Family appearance and a
   semantic-confusion worst fraction; re-capture passes.
2. Build the calibration harness that renders the reference against declared
   perturbed clones of itself through all six frozen cameras, using scene-space
   damage rather than image-space approximation. Existing control families are
   `SCENE_CONTROLS`, `GEOGRAPHY_CONTROLS`, `HORIZON_CONTROLS` in
   `tools/evaluation/scene-perturbations.mjs`, shaped
   `{ id, class: identity|mild|severe, detects, apply }`. `collect` in
   `run-scene-calibration.mjs` takes mild samples from identity and mild controls
   and severe samples only from controls whose `detects` names the metric.
3. Extend the baseline through a versioned migration. Thresholds are shaped
   `{ name, scope, path, direction, threshold }`. Geometry thresholds must not
   move; the red check pins all 13 by value.
4. Demote rather than loosen any metric that cannot separate its bracket, and
   prove every declared control is caught by at least one gating metric.

Two things not to get wrong here:

- Calibrate on **per-group** metrics. Whole-frame silhouette IoU is 0.994 while
  per-group is 0.422, because geography fills 84 to 86 per cent of every
  auxiliary frame. Gating the whole-frame number would recreate the blind spot
  ADR-0049 just removed.
- ADR-0040 defers `nativeAppearance` until every geometry layer passes, so an
  unevaluated appearance layer is correct while the candidate is red. That is a
  different state from a layer with no thresholds, and the red check
  distinguishes them by `reason` and `blockedBy`. "All four layers evaluated"
  is not achievable, and not the goal.

### After that

Tickets 02 atmosphere, 03 terrain, 05 horizon ridges, and onward.

Tickets 03 and 05 depend only on 3D evidence and are unaffected by the camera
work.

- Ticket 03: terrain budget is 32 coastline controls, 40 landforms, 4 noise
  octaves; the recipe uses 28 coast nodes, 40 landforms, 3 octaves, so there is
  headroom in coast nodes and octaves but none in landforms. The coastline
  already passes — symmetric p95 15.7475 against 22.02965 and area error 1.97 per
  cent against 10.55. The failure is elevation and the shore band: the
  classification confusion is shore->land 395, land->shore 147, shore->sea 161,
  sea->shore 123.
- Ticket 05: the Horizon Profile already covers all 720 azimuth bins with none
  missing, so the failure is purely angular accuracy — p95 5.6658 deg against a
  0.945 deg threshold, worst azimuth 7.1609 deg at 162 deg.

## Things that are easy to get wrong

- The evidence files are inputs to the gate stack. After changing a generator,
  re-run the measurement commands before reading a report, or the report
  describes the previous candidate.
- `tools/evaluation/reference-classification.json` is gitignored and no script
  writes it. Anything that must run on a clean checkout has to read the Scene
  Recipe instead, which is committed and reference-measured.
- `Authored Village` has mesh-less organisational children such as
  `PandaVillage`. Resolving a family for every child throws on them; only
  geometry-bearing roots should be resolved.
- `measureHorizon` and friends take an explicit recipe. Node caches modules by
  specifier, and busting only the importer still serves the cached recipe to
  everything it depends on.
- Semantic structure is a one-sided deficit. Do not restore an absolute delta:
  penalising extra parts equally pushes every generator toward a single mass.
- Generation is currently 3.2 s and 678k triangles. Both are outside any
  sensible budget and belong to ticket 14.
