# Full Island Reconstruction — handoff

Authority for a fresh session: this file, `spec.md`, the relevant ticket under
`issues/`, `CONTEXT.md`, and ADR-0036 through ADR-0051.

## Where the work stands

Branch `experiment/claude-full-island-scene`.

Scene Parity Foundation is complete and certified. `foundation=PASS` with
`candidate=RED`, which is the milestone's intended result.

| Ticket | State |
| --- | --- |
| Foundation 01-12 | done, certified |
| Camera-set v2 migration (ADR-0049, ADR-0050) | done |
| Reconstruction 01 — calibrate the two rendered gate layers (ADR-0051) | done |
| Reconstruction 02 — atmosphere | in progress, see below |
| Reconstruction 08 — vegetation canopies | done |
| Reconstruction 03-07, 09-16 | ready-for-agent |

## Ticket 02, in progress

**Done and committed.** The Production Runtime had no post-processing at all while
the authored scene renders through a composer, so every appearance measurement was
dominated by the absence of bloom, grade, and vignette.
`gt_designer/src/reconstruction/scene/environment-postprocessing.js` reproduces the
authored chain — render, bloom, one grade-and-vignette shader, output — from the
Environment Recipe's parameters, and is used by both the production page and the
candidate's evaluation path. Global appearance DeltaE fell from 26.17 to 22.17 with
every geometry metric bit-identical. The recipe gained `grading.tint`,
`grading.lift`, and `vignette.falloff`: `warmMix` and `gamma` alone do not describe
the grade, and without them the generator had to invent the colours it mixes
towards. The whole chain is 13 numbers, nothing is loaded, and certification still
reports 0 external requests.

**Also done: the atmosphere is now measurable.** It was not. Appearance region masks
came from the auxiliary semantic pass, which hides the sky shell so a backdrop
filling every frame cannot make geometry evidence report perfect agreement — so
`sky` had no mask at all and the atmosphere sat inside the global mean attributable
to nothing. The ticket that exists to fix the atmosphere had no measurement of it.
Regions now come from a second semantic index over the same frame that keeps the sky
shell; the geometry passes still exclude it.

**Uncommitted, deliberately.** `test/atmosphere-reconstruction.test.mjs`, 5
assertions, 3 green and 2 red. The repository forbids committing a known-failing
check, so it stays in the working tree exactly as ticket 01's red check did. Its two
red assertions are the appearance thresholds, which no ticket before 11 can satisfy.

**Also done: the sky dome is reproduced.** The recipe recorded it as two colours; the
authored dome is five colours, three smoothstep bands, a warm horizon haze, and a
two-term sun glow. The generated material also used a different height mapping —
`dir.y * 0.5 + 0.5` spreads the gradient over the whole sphere and puts the horizon
colour halfway up — and was missing `fog: false`, so the backdrop the fog fades into
was itself being fogged. The recipe gained `mid`, `haze`, `glow`, `radius`,
`midStop`, `zenithStop`, `hazeBand`, and `sunGlow`, and the candidate now clears to
the horizon colour and does not cull the dome. `authoredOverview` sky fell from
26.535 to 17.553 and global appearance from 22.173 to 21.531, geometry bit-identical.

**What the measurement says now**, per region:

| region | DeltaE | belongs to |
| --- | --- | --- |
| sky | 3.34 on `oblique-north`, 17.55 on `authoredOverview` | 02, but see below |
| horizon | 6.99 to 12.28 | 05 |
| geography | 16.90 to 26.14, about a million pixels per camera | 03, 04 |
| plazas | 26.40 to 34.20 | 06 |
| structures | 31.19 to 40.19 | 07, 11 |
| vegetation | 38.31 to 52.23 | 11 |

Global appearance DeltaE is 21.531 against a calibrated threshold of 2.852, worst
camera `topDown` at 28.595.

**Read the `sky` figure carefully.** It is not only sky on cloud-heavy cameras. Cloud
sprites are hidden in the mask pass, because a sprite cannot take a mesh pass
material, so wherever a cloud is drawn in the lit capture the mask labels that pixel
`sky`. `authoredOverview` is the camera with clouds across its frame, which is most
of why it reads 17.55 while the obliques read 3.34 to 9.40. So the remaining sky
residual is largely a cloud comparison, and clouds belong to Distributed Scene Cover
(09) and the frozen dynamic environment (13). Attributing them needs a sprite-aware
index pass; until that exists, `sky` on a cloud-heavy camera means sky-and-cloud.

`oblique-south` at 9.40 is the largest true sky residual — it is the camera looking
towards the sun's azimuth, so the glow terms affect it most, and it is worth a look
on its own before the sky is called done.

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
  a sprite population that begins at 0.2539 in a band reaching `y=3174.86`.
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
Result is frozen in `tools/reference/baselines/reference-camera-set-v2.json`:
oblique standoff 946 units, top-down 598, island share of frame 4.05 to 16.21 per
cent, groups at zero pixels 0. Gate:
`node --test test/reference-camera-framing.test.mjs`, 11 assertions, green.

**Whole-frame silhouette IoU is not island evidence.** Geography fills 84 to 86
per cent of every auxiliary frame, so 0.994 is ground agreeing with ground while
per-group IoU is 0.422. The same is true of whole-frame contour distance, which
ADR-0051 measured at 0 pixels on `topDown` and 1 pixel on all four obliques.
Neither is gated.

## Commands

```bash
npm test                              # 221 tests
npm run check:scene-foundation-reconciliation
npm run check:reference-observation   # two full browser observations, slow
npm run check:scene-coverage
npm run check:scene-correspondence
npm run check:geography
npm run check:horizon
npm run check:scene-generation
npm run check:scene-calibration
npm run check:fixed-camera-calibration
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
and get killed. Use a backgrounded shell for anything long.

## Re-measurement order when the camera set changes

1. `npm run observe:reference` — freezes the camera set baseline
2. `node scripts/run-scene-passes.mjs` — six cameras, must be re-captured
3. `npm run measure:geography` — frustum coverage depends on the cameras
4. `npm run calibrate:scene`
5. `npm run report:scene-parity`
6. `npm run certify:scene-parity-foundation`

`measure:horizon` is unaffected: it reads only
`recipe.environment.camera.position`.

## Re-measurement order when a pass metric changes

Anything under `tools/evaluation/scene-pass-metrics.mjs` is computed inside the
browser at capture time and stored as summaries, so editing it invalidates every
stored capture. Re-run **all** of these, not just the candidate side:

1. every fixed-camera control — see below; the aggregate refuses to mix captures
   whose damage-target inventory differs, but it cannot detect a metric edit
2. `node scripts/run-scene-passes.mjs`
3. `npm run calibrate:scene`
4. `npm run report:scene-parity`
5. `npm run certify:scene-parity-foundation`

## The fixed-camera and native-appearance layers, calibrated

ADR-0051. Both layers held `[]` and therefore could not pass; the whole stack
could not express a pass. They are now frozen from declared reference-only damage
applied to the reference's own scene graph and rendered through the six frozen
cameras.

```bash
node scripts/run-fixed-camera-calibration.mjs --list
node scripts/run-fixed-camera-calibration.mjs --control identity,translate-0.15
node scripts/run-fixed-camera-calibration.mjs --aggregate
npm run check:fixed-camera-calibration
```

Design, and why it is shaped this way:

- Damage is **scene-space**: placement roots move, scale, turn, or disappear, the
  terrain rises, materials change, then the frame is captured. No image-space
  approximation, so the thresholds mean what the world-space layers' mean.
- The bracket values are the world-space bracket's values — 0.15 units, 1 per
  cent, 0.02 radians mild; 12 units, 45 per cent, 0.9 radians severe — so "mild"
  and "severe" mean one thing across the stack. `test/scene-calibration.test.mjs`
  asserts the two declarations cannot drift apart in class.
- `--control` takes a comma list. The undamaged capture is taken once per camera
  and shared by the whole batch, so batching is much cheaper than one control per
  run. Geometry controls skip the lit-RGB composer pass; appearance controls need
  only it.
- Measured cost on this host: the full 16-control set is about 10 minutes of
  SwiftShader time in four batches, far cheaper than the 40-to-60 minute estimate
  an earlier revision of this file recorded. A render plus readPixels is nearer
  1.3 seconds than 8.
- Calibration is the one thing that mutates the Assembled Authored Scene. Each
  capture snapshots every world matrix, visibility flag, and material colour it
  touches, audits them after restoring, and re-renders a frame to compare byte
  for byte with the undamaged one. `verifyScenePassProtocol` still refuses a
  mutated reference; calibration is checked by
  `verifyCalibrationCaptureProtocol`, and both share one implementation of the
  frozen-camera checks.
- Reference-only is proven from the page's own request log, not asserted. The
  calibration page loads the reference and the harness and never the Scene
  Generation Module.
- The baseline's contents are now revision `scene-quality-baseline-v1.1`; its
  schema stays `scene-quality-baseline-v1`, which the gate stack requires. Each
  revision names itself, its ADR, and the geometry thresholds it moved, and
  `run-scene-calibration.mjs` asserts that list against the file on disk.
- `detects` and `class` are read from the live declaration at aggregate time, not
  from the stored partial, so correcting which metric a control is responsible for
  does not cost a re-render.

### Six defects the calibration found

Four of them were in the harness's own first cut, which is what a bracket is for.

1. **Whole-frame contour distance is dead.** p95 is 0 on `topDown` and 1 pixel on
   all four obliques, because the whole-frame silhouette is everything that is not
   sky and its outline is the frame border. `aggregateCameras` now also reports
   `groupContourDistance`, and that is what the layer gates.
2. **`semanticConfusion.worstFraction` returned `null` when nothing was
   confused.** The gate stack reads a null as missing evidence and fails the
   metric, so a subject that mislabelled nothing would have failed the metric that
   exists to catch mislabelling. Now 0 when pixels were compared, null only when
   none were.
3. **Contour distance against an absent group returned the distance-transform
   sentinel.** A deleted village produced a per-group contour p95 of 9.2e7 and a
   raised terrain 1.8e8, and a threshold calibrated between mild variation and
   those would have accepted any candidate at all. Contour distance is now null
   when either subject rendered no contour; absence is already reported by an IoU
   of zero and by semantic occupancy.
4. **World-normal p95 was saturated.** A 0.15-unit translate produced a per-group
   p95 of 45.75 degrees and a 1 per cent scale 69.57, with individual groups above
   150 — a normal that flipped, not one that rotated. Most pixels here sit on
   geometry one or two pixels across, so a sub-pixel shift makes a pixel see a
   different surface. The candidate's 71.22 degrees sat inside that mild band, so
   the metric could not discriminate anything. `worldNormalEvidence` now compares
   orientation only where linear depth also agrees within 2 world units, the
   world-geometry layer's own `surface p95` limit being 2.3479. The unrestricted
   value and the corresponding-pixel fraction are still reported.
5. **`scaleBy` pivoted on the transform origin.** A horizon ridge whose geometry
   sits 1400 units from its origin moves 14 units when scaled by one per cent, so
   the mild `extent-1pct` control was reporting a per-group IoU of 0.685 — severe
   damage wearing a mild control's name, which would have widened the mild bracket
   until nothing failed it. Scaling now pivots on each root's own bounding-box
   centre. IoU became 0.892.
6. **`rotateY` had the same bug, worse.** 0.02 radians swung a ridge through 28
   units, giving `yaw-0.02` a per-group depth p95 of 12.26 world units. Same
   correction; it became 2.32.

A seventh, in the declarations rather than the code: a control that damages one
group out of eleven cannot be asked to move a mean taken over groups, because
`selectThreshold` takes the *best* severe result and one weak claim sets the limit
for every strong control too. `delete-structures`, `collapse-vegetation`, and
`raise-terrain-12` therefore claim only worst-case and pixel-weighted metrics.
`yaw-0.9` applies to every placement root rather than to the buildings alone, so
it differs from the mild yaw in magnitude and nothing else.

Which aggregates are weighted how, because this decides what a control may claim:

| aggregate | weighting |
| --- | --- |
| `groupSilhouetteIoU.mean`, `groupContourDistance.meanP95`, `groupDepthWorldUnits.meanP95`, `groupWorldNormalDegrees.meanP95` | over (camera, group) rows |
| `semanticAgreement.mean`, `appearanceDeltaE.meanMean` | over cameras, pixel-weighted within each |
| `appearanceByMaterialFamily.meanMean` | over (camera, family) rows |
| everything named `worst` | single worst row |

### The measured bracket

Mild is identity plus the three mild controls; severe samples come only from the
controls that declare the metric.

| control | class | group IoU | contour p95 | depth p95 | normal p95 | semantic | confusion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| identity | identity | 1 | 0 | 0 | 0.000001 | 1 | 0 |
| translate-0.15 | mild | 0.894 | 1.41 | 0.94 | 39.37 | 0.9959 | 0.0027 |
| extent-1pct | mild | 0.892 | 1.68 | 1.49 | 33.69 | 0.9906 | 0.0059 |
| yaw-0.02 | mild | 0.864 | 1.99 | 2.32 | 36.85 | 0.9894 | 0.0061 |
| translate-1.2 | intermediate | 0.688 | 3.69 | 6.64 | 61.55 | 0.9814 | 0.0095 |
| extent-8pct | intermediate | 0.679 | 8.69 | 9.58 | 57.01 | 0.9669 | 0.0149 |
| translate-12 | severe | 0.330 | 17.53 | 23.63 | 77.47 | 0.9402 | 0.0355 |
| extent-45pct | severe | 0.392 | 48.50 | 27.77 | 73.89 | 0.9022 | 0.0615 |
| yaw-0.9 | severe | 0.436 | 34.34 | 43.79 | 79.72 | 0.8946 | 0.0690 |
| delete-structures | severe | 0.807 | 6.33 | 0 | 0.000001 | 0.9912 | 0.0099 |
| collapse-vegetation | severe | 0.777 | 12.42 | 4.25 | 10.31 | 0.9607 | 0.0769 |
| raise-terrain-12 | severe | 0.472 | 74.14 | 1.46 | 0.192 | 0.9816 | 0.0284 |

Read the single-group severe rows carefully: `delete-structures` reports semantic
agreement 0.9912, *better* than the 0.9894 a mild 0.02-radian yaw of everything
produces, because 39 structure roots are about one per cent of the pixels. Deleting
the whole village is a worst-case failure, and it trips the worst-case metrics hard
— structures fall to an IoU of 0.029 against a mild worst of 0.341. Since
`selectThreshold` takes the *best* severe result, letting that control claim a
pixel-weighted mean would have set the limit for every strong control too and
demoted the metric. Scope has to match how a metric is weighted, in both
directions.

Appearance, measured separately because it needs only the lit pass:

| control | class | global DeltaE | family DeltaE |
| --- | --- | --- | --- |
| identity | identity | 0 | 0 |
| albedo-1pct | mild | 0.327 | 0.516 |
| albedo-8pct | intermediate | 1.244 | 2.260 |
| wrong-role-palette | severe | 10.428 | 22.301 |
| recolour-palm-foliage | severe | 0.347 | 1.135 |

`recolour-palm-foliage` barely moves the global mean, which is the point: it
exists to prove the per-family metric catches what the global average cannot, and
it claims only `worst material family appearance DeltaE`.

### What was frozen

Fourteen metrics gate; one is demoted. Full table with mild and damage endpoints is
in ADR-0051.

| layer / metric | direction | threshold |
| --- | --- | --- |
| group silhouette IoU | atLeast | 0.745598 |
| worst group silhouette IoU | atLeast | 0.302569 |
| group contour distance p95 | atMost | 5.874122 |
| worst group contour distance | atMost | 39.2559 |
| group depth p95 | atMost | 7.644414 |
| worst group depth p95 | atMost | 22.354947 |
| group world normal p95 | atMost | 49.456982 |
| semantic agreement | atLeast | 0.987474 |
| worst camera semantic agreement | atLeast | 0.974085 |
| worst semantic confusion fraction | atMost | 0.007092 |
| appearance DeltaE mean | atMost | 2.852463 |
| worst camera appearance DeltaE | atMost | 4.228213 |
| material family appearance DeltaE mean | atMost | 5.961796 |
| worst material family appearance DeltaE | atMost | 4.062021 |

`worst group world normal p95` is demoted, not loosened: mild variation reaches
174.07 degrees while declared damage reaches 167.61. The depth-correspondence
restriction fixed the aggregate, which separates 39.37 from 79.72, but a maximum
over every camera and group always finds a group of thin double-sided props.
`decorations` is 58 props of a few pixels each on an oblique camera and hits 171
degrees under a one per cent scale. The declared next refinement is unsigned
comparison, treating a normal and its negation as one plane; that changes what the
metric means and belongs in its own revision.

Three thresholds are tight because that is what the damage supports, not by
accident: `worst group depth p95` between 21.64 and 24.50, `semantic agreement`
between 0.9894 and 0.9816, `worst semantic confusion fraction` between 0.00614 and
0.00994. Do not widen them because they look close.

`desaturate-albedo` was replaced by `wrong-role-palette` because it was measured
at DeltaE 0.057 — *less* than the one per cent mild control. The authored
materials are textured with white base colours, so replacing a colour with its own
luminance is a no-op. A base colour multiplies its map, so a per-channel cast
reaches every surface. Removing the maps instead would have calibrated the layer
against having no texture at all, which is the Production Runtime's own legitimate
condition, and a textureless candidate would then pass by construction.

## Current candidate result

Read the live numbers from `scene-parity-report-v1.json`, not from a
certification written before the last measurement.

World layout is exact and must stay that way: anchor, Target AABB Extent, typed
orientation, neighbourhood distance, zone occupancy, and overview overlap
ordering all report zero error across all 672 entities.

Failing world-geometry metrics:

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

Per-Material-Family appearance, the largest single residual being `palm-foliage`:

| family | mean DeltaE |
| --- | --- |
| palm-foliage | 61.61 |
| blossom-foliage | 35.32 |
| painted-timber | 34.38 |
| paving-stone | 33.83 |
| creature-fur | 32.99 |
| ocean-surface | 29.03 |
| shore-rock | 26.91 |
| terrain-ground | 22.68 |
| bamboo-foliage | 22.35 |
| distant-rock | 16.24 |

Global mean 26.17. Worst semantic confusion `geography->horizon` on
`oblique-north` at 4.17 per cent.

The fixed-camera layer is now evaluated and fails all ten of its metrics. This is
the first time it has produced a result rather than "not evaluated":

| metric | value | threshold |
| --- | --- | --- |
| group silhouette IoU | 0.421857 | 0.745598 |
| worst group silhouette IoU | 0.000709 | 0.302569 |
| group contour distance p95 | 74.531695 | 5.874122 |
| worst group contour distance | 391.562 | 39.2559 |
| group depth p95 | 29.810676 | 7.644414 |
| worst group depth p95 | 202.4158 | 22.354947 |
| group world normal p95 | 71.994121 | 49.456982 |
| semantic agreement | 0.921404 | 0.987474 |
| worst camera semantic agreement | 0.885508 | 0.974085 |
| worst semantic confusion fraction | 0.041653 | 0.007092 |

`nativeAppearance` is `blockedBy: ["worldGeometry", "fixedCameraGeometry"]`, which
is ADR-0040's ordering rule and not a missing calibration. The two states are
distinguished by `reason` and `blockedBy`, and the red check asserts the
difference. Certification reports `foundation=PASS candidate=RED (worldGeometry,
fixedCameraGeometry, nativeAppearance)` against baseline
`scene-quality-baseline-v1.1`.

For contrast, the whole-frame numbers on the same capture: silhouette IoU 0.994,
contour p95 5.67, world normal p95 4.02 degrees. All three look close to perfect
while the per-group figures above are nowhere near. None of them is gated.

Whole-frame world normal fell from 71.22 to 4.02 degrees under the
depth-correspondence restriction, which is not an improvement in the candidate: it
means almost all of the old figure came from pixels where the two subjects were
looking at different surfaces. The per-group figure, 71.99, is the one that
measures the island.

## Next steps

Tickets 02 atmosphere, 03 terrain, 05 horizon ridges, and onward. Tickets 03 and
05 depend only on 3D evidence and are unaffected by the camera and calibration
work, so they can proceed in parallel.

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
- Ticket 11: `palm-foliage` at DeltaE 61.61 is the largest appearance residual.

## Things that are easy to get wrong

- The evidence files are inputs to the gate stack. After changing a generator,
  re-run the measurement commands before reading a report, or the report
  describes the previous candidate.
- Editing a pass metric invalidates every stored capture, including all sixteen
  calibration control partials. See the re-measurement order above.
- `tools/evaluation/reference-classification.json` is gitignored and no script
  writes it. Anything that must run on a clean checkout has to read the Scene
  Recipe instead, which is committed and reference-measured.
- `Authored Village` has mesh-less organisational children such as
  `PandaVillage`. Resolving a family for every child throws on them; only
  geometry-bearing roots should be resolved.
- Eleven authored village placements resolve to the `terrain-ground` Material
  Family. Selecting the terrain by family alone picks up village slabs with it;
  the terrain is `group === "geography" && material === "terrain-ground"`.
- `measureHorizon` and friends take an explicit recipe. Node caches modules by
  specifier, and busting only the importer still serves the cached recipe to
  everything it depends on.
- Semantic structure is a one-sided deficit. Do not restore an absolute delta:
  penalising extra parts equally pushes every generator toward a single mass.
- Generation is currently 3.2 s and 678k triangles. Both are outside any
  sensible budget and belong to ticket 14.
- A browser run occasionally dies with "browser exited before DevTools was ready"
  right after other Edge processes were killed. It is a startup race, not a code
  failure; re-run the batch.
