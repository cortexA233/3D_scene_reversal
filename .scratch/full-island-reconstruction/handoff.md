# Full Island Reconstruction — handoff

Authority for a fresh session: this file, `spec.md`, the relevant ticket under
`issues/`, `CONTEXT.md`, and ADR-0036 through ADR-0060.

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
| Reconstruction 04 — ocean surface | landed; gate red behind vegetation and architecture |
| Reconstruction 05 — horizon ridges | landed; gate red at a recorded boundary (ADR-0052) |
| Reconstruction 08 — vegetation canopies | landed; the sampler defect behind it is fixed (ADR-0055) |
| Reconstruction 03 | boundary recorded (ADR-0054); one in-budget attempt named |
| Reconstruction 09 — distributed cover | landed; the reference measurement was wrong and is fixed (ADR-0053) |
| Reconstruction 10 — semantic part structure | done; gate passes at 0 against 3.5 (ADR-0056) |
| Reconstruction 11 — material families | in progress; every albedo is measured, distant-rock converged |
| Reconstruction 06 — ground surfaces | plazas, decks and rocks landed (ADR-0057, ADR-0058); `paths` blocked on 03 |
| Reconstruction 15 — native GPU evidence | done for every browser present (ADR-0059); Firefox/Safari need a non-CDP transport, not an install |
| Reconstruction 12 — decorations (partial) | `lantern` and `npc-statue` landed as axial profiles (ADR-0060); the other 17 kinds are mostly single placements |
| Reconstruction 07, 12-14, 16 | ready-for-agent; 07 blocked on a per-entity form decision |

## Read this before trusting any number below

`scene-quality-baseline-v1.2` and every rendered measurement in this file are
**post-ADR-0053**. Three encoding defects made the reference's own masks wrong,
and the numbers a previous revision of this file recorded were measured through
them. If you are comparing against an older note, the older note is wrong.

The short version: three.js multiplies a material's colour by an
`InstancedMesh`'s `instanceColor` whenever one is present, so every mask pass
read back a tinted identity for the two ground-rock populations that call
`setColorAt`. `cover`'s reference mask held 128 pixels on the authored overview
where the scene draws 5,299, and all 5,172 went to `plazas`, whose mask was
therefore 84 per cent scatter. Separately, the depth and world-normal
`ShaderMaterial`s ignored `instanceMatrix` and drew every instance on its mesh's
origin, and the identity lattice could not carry the fourteenth group.

All sixteen reference-only controls were re-captured and the two rendered layers
re-derived. Two thresholds got **stricter**. The encodings now live in
`tools/evaluation/scene-pass-encoding.mjs`, which imports only `three`, and
`test/scene-pass-encoding.test.mjs` holds them to fixtures without a GPU — four
of its six assertions fail against the previous behaviour.

**The lesson for whoever is next: a pass had no check of its own for the whole
Foundation, and an encoding defect and a candidate defect are indistinguishable
in the reported numbers.** Before fitting anything against a rendered
measurement, ask what would happen if the pass were wrong, and whether anything
would tell you.

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

**The check is committed, with two assertions marked `todo`.**
`test/atmosphere-reconstruction.test.mjs`, 5 assertions: 3 pass and 2 are `todo`.
The two are the calibrated appearance thresholds, which ticket 02 cannot reach on its
own — appearance DeltaE is 21.50 against 2.85, and what is left is ground, vegetation,
and architecture rather than atmosphere. They are marked rather than deleted or
loosened: the assertions are unchanged, `npm test` exits 0 and reports `todo 2`, and
clearing the flag is how tickets 04, 06, 07, and 11 prove they landed. Do not loosen
the thresholds to turn them green.

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

| region | mean DeltaE over the cameras | belongs to |
| --- | --- | --- |
| sky | 5.96 (3.84 on `oblique-north`, 8.82 on `authoredOverview`) | 02, largely settled |
| horizon | 16.60 | 05, at its recorded boundary |
| geography | 15.19, about a million pixels per camera | 03 |
| plazas | 33.18 | 06 |
| structures | 35.41 | 07, 11 |
| vegetation | 43.54 | 11 |
| cover | 22.04 | 09, landed |

Global appearance DeltaE is 13.172 against a calibrated threshold of 2.852, worst
camera `authoredOverview` at 17.281.

Per Material Family, averaged over the six cameras, which is the ranking to work
down: `palm-foliage` 51.87, `blossom-foliage` 33.28, `paving-stone` 33.21,
`painted-timber` 32.29, `creature-fur` 24.48, `terrain-ground` 23.66,
`bamboo-foliage` 22.98, `shore-rock` 20.07, `distant-rock` 16.60,
`ocean-surface` 14.72.

**The `sky` figure is still sky-and-cloud, but the clouds are now the candidate's
too.** Cloud sprites cannot take a mesh pass material, so they are hidden in the
mask pass and wherever a cloud is drawn in the lit capture the mask labels that
pixel `sky`. `authoredOverview` is the cloud-heavy camera, which is why it reads
8.82 while the obliques read 3.84 to 6.15. Giving the candidate's cloud shell its
measured span, aspect and material took that camera from 16.59 to 8.82, which is
the strongest evidence available that most of the old residual was the missing
clouds rather than the dome.

`oblique-west` at 6.15 is now the largest sky residual and `oblique-south` at 6.12
the second; the latter looks towards the sun's azimuth, so its glow terms affect it
most, and it is worth a look on its own before the sky is called done.

## Ticket 09, landed

Two placement defects were fixed in an earlier round and hold: cover was planted
on the seabed (a population's region is an ellipse over an island, and an ellipse
over an island is mostly water), and the waterline rule that fixed it takes the
*first* dry draw rather than the best of the batch, which is what keeps the
scatter spread out. Floors are 11.2 to 14.1 against authored 13.3 to 25.3; the
three small inland populations are still about eleven units low and that residual
is ticket 03's terrain, not cover's — under those ellipses the candidate's terrain
tops out near 28 against authored floors of 23.7 to 25.3.

**What this round found.** The scale correction the previous round made was
fitted against a reference number that was wrong by forty-one times, and it moved
a candidate that was within 0.1 per cent of correct *away* from the reference. See
the section above. Cover was too sparse, not seventeen times too dense.

**What cover carries now,** measured per instance by
`tools/development/measure-cover-instances.mjs` into
`.scratch/full-island-reconstruction/evidence/cover-instances-v1.json`:

| count | scale | median | exponent | sink | form extent |
| --- | --- | --- | --- | --- | --- |
| 4200 | 0.117-1.008 | 0.296 | 2.317 | 0.291 | 2.17 x 1.82 x 2.47 |
| 948 | 0.424-1.732 | 0.983 | 1.226 | 0 | 2.09 x 1.92 x **0** |
| 900 | 0.344-2.561 | 0.844 | 2.148 | 0.271 | 2.17 x 1.83 x 2.47 |
| 145 | 0.464-1.945 | 1.129 | 1.156 | 0 | 1.58 x 2.00 x **0** |
| 127 | 0.540-1.416 | 0.923 | 1.194 | 0 | 2.02 x 0.89 x **0** |

Three things a summary could not say. The ladder has a *shape* — the rocks are
power laws at 2.15 and 2.32, and the uniform range derived from measured surface
area put the median at 1.5 times the authored one with no instance below 0.71, so
every candidate instance cleared a pixel where the reference renders most of them
below one. Rasterisation is not linear in size, so matching the sum of squared
scales does not match pixels. The rocks are **sunk** 0.27 and 0.29 of their own
scale and the grass is not. And three of the five populations are **two-triangle
blades with no thickness**, rooted at their base rather than centred: the old
`kind` rule called anything whose *population bounds* stood taller than three
units a rock, and the grass ellipses span seven units of terrain, so all five were
labelled rocks and three got rock albedo and a solid cone.

Ten measured numbers per population now, and the recipe contract rejects a
population that omits any of them, because every one of them was invented before
it was measured and two of them were invented twice.

Result: cover contour p95 **173-414 pixels to 22.6-49.0** against a 39.3
threshold, inside it on five of six cameras and inside the depth threshold on
four. The remaining gap is generator *form*, not distribution — the authored rock
is an 80-triangle noise-displaced lump and the candidate's is a 20-triangle
icosahedron stretched to the same bounding box, which under-draws it.

**Clouds are improved and not finished.** The region is now the band the sprite
*centres* occupy rather than the band their extents reach, which was
double-counting each cloud's own radius; the span ladder is the measured sprite
widths; and the form carries the measured 0.542 height-to-width aspect instead of
being a sphere. Bounds went from -1,394..4,190 to **-483..3,440** against an
authored -502..3,175.

Giving them their measured size revealed they had no appearance program at all —
they drew as opaque `ocean-surface` teal spheres and took `sky` from DeltaE 3.35
to 29.66 on the north oblique. Rather than shrink them back to invisible, which is
a missing object hidden inside an appearance average, they now use their sprites'
own measured material: white, opacity 0.9546, transparent, with the standard
soft-particle falloff and no fitted constant. Global appearance DeltaE **13.364 to
13.172** and `sky` on the cloud-heavy overview **16.59 to 8.82** — better than
before the clouds were sized at all.

The residual: authored span correlates with height at -0.46, higher clouds being
smaller, and the generator draws scale independently of position. That is one more
measured number, but clouds are hidden in every auxiliary geometry pass, so their
only gated contribution is through the `sky` appearance region, which belongs to
tickets 02 and 13.

**The frozen worst-group intersection no longer gates cover, and this is
measured.** Through the corrected passes a *mild* 0.02-radian yaw of the reference
against itself reads 0.0415 on cover and a mild one per cent scale reads 0.1344,
against 0.302569 — the group is 5,100 instances one to a few pixels across, so
once anything moves further than an instance's own footprint there is nothing left
to intersect. A per-pixel intersection is an instance pairing, which Distributed
Scene Cover is *defined* not to be compared by, so that maximum now ranges over
identity-bearing groups. Scoping it made it **harder**: `paths` at 0.4299 mild
against `vegetation` at 0.1872 severe puts the threshold at 0.369228.

Cover stays in every mean, stays in the contour and depth maxima whose own
brackets separate on it (17.9 to 268.6 pixels, 5.3 to 86.5 world units), and its
intersection is still reported as `worstDistributed`. A fixture in
`test/scene-pass-metrics.test.mjs` bounds the scope, because excluding a group
from a worst-case metric is one keystroke from hiding one.

The declared next step, if a distribution gate is wanted: a position-tolerant
occupancy comparison calibrated from a new reference-only control that re-draws
the scatter under the reference's own rule with a different stream. Semantic
Pattern Coverage is the precedent already in this repo. That needs editing
`scene-pass-metrics.mjs`, which invalidates every stored capture, so it is a
deliberate re-measurement rather than a free change.

## Ticket 04, landed

The authored sea is `THREE.Water` — mirror render target, four samples of a
loaded `waternormals.jpg`, Schlick Fresnel, Blinn-Phong sun. The candidate had a
flat `MeshStandardMaterial` plane. It is now an analytic `ShaderMaterial` whose
wave bands stand in for the normal map's own tilings and whose reflection samples
the same sky gradient the dome renders, so the water and the backdrop cannot
disagree. Thirteen numbers added to the Environment Recipe; nothing loaded.

Ocean DeltaE per camera 26.04/25.64/16.13/20.29/18.89/19.70 ->
15.34/9.86/7.15/11.24/10.20/9.62. **Global appearance DeltaE 21.311 -> 13.369.**
Every geometry metric unchanged, which is what an appearance-only change should
do. Worst camera is `authoredOverview`, the framing that looks along the sea to
the horizon.

The phase is *declared*, not read from a clock: the Frozen Observation Clock pins
`performance.now()`, so the authored surface's own frame delta is zero and it
renders one repeatable phase. A Production Runtime may not read device state, so
`environment.ocean.phase` carries it.

**What is not done:** the wave amplitudes and the shader's three coefficient
pairs are the authored values used as-is, unfitted. Fitting them needs a browser
in the loop, because the sea is only measurable through a rendered capture, and
the Reference-guided Fitting Loop is Node-side and measures geometry. **Build
that harness before tickets 06, 07 and 11** — all three are appearance tickets
with exactly this shape, and each will otherwise be hand-tuned through 90-second
capture round trips.

## Ticket 05, landed, and the boundary it found

Full numbers are in the ticket. The short version:

Each Horizon Group was a union of half-buried spheres. A sphere's widest point is
its own equator, so every group stood near summit height across nearly all of the
azimuth it covered. **The recorded visual impression was backwards** — the review
said the candidate's distant mountains were low and blocky; the measurement says
the skyline was 2.6453 degrees *above* the reference and was the higher of the two
in 624 of 720 bins. Absolute angular error cannot tell those apart, which is why
`profile.signedBias` is now part of the evidence.

The authored form, read out of the reference GLB with the loaders already in
`devDependencies`: a narrow diagonal ridge band filling 31 per cent of its own
bounding box. Reproduced as one swept crest ridge per group, threaded through the
measured summits, with six bounded per-group controls and two per summit.

Profile p95 5.6658 -> 2.5002 deg, worst azimuth 7.1609 -> 3.7618, signed bias
+2.6453 -> -0.0036, per-group silhouette p95 0.0627 -> 0.0253, subtended-angle
error mean 0.766 -> 0.079, depth centre error mean 32.77 -> 7.84, worst entity
surface p95 165.67 -> 143.10, draw calls 1,714 -> 1,708. Placement, extent,
orientation, overlap ordering and coverage all still exact.

**The gate is still red and cannot be made green within the eight-form cap.**
ADR-0052 records the bound: the optimal piecewise-linear approximation of the
worst group's own measured profile — exact by dynamic programming, and unbeatable
by any generator carrying that many crest controls — needs 3.257 deg at eight
nodes and 0.952 at twenty-four, against 0.945. The achieved fit lands where the
bound predicts, which is the evidence that the fitter is not what is limiting.
The frozen assertion in `test/horizon-reconstruction.test.mjs` is marked `todo`,
unchanged. **Do not loosen it.**

The declared way through, for whoever picks this up: the sixteen groups are
instances of **three** authored meshes (6, 7 and 3 instances), which is why their
measured summit sets repeat the same heights under rotation and mirroring. Three
shared crest tables at twenty-four nodes is 216 numbers instead of 1,152 and puts
the bound under the threshold while staying compact. Derive the family by
clustering measured shape, never from the source mesh identity. New
representation, so: reference-only measurement, versioned gate revision, own ADR.

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
npm test                              # 255 tests, 249 pass, 2 fail, 4 todo
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
| surface p95 mean | 9.4508 | 2.3479 |
| worst entity surface p95 | 143.0972 | 13.758675 |
| over-tolerance surface fraction | 0.6018 | 0.11835 |
| worst component deficit | 9 | 3.5 |
| terrain height p95 | 8.532 | 5.26875 |
| shore height p95 | 7.9996 | 2.85035 |
| land and sea agreement | 0.922721 | 0.931361 |
| horizon profile p95 | 0.043636 | 0.0165 |
| worst azimuth horizon error | 0.065655 | 0.0165 |

Per-Material-Family appearance, the largest single residual still being
`palm-foliage`:

| family | mean DeltaE |
| --- | --- |
| palm-foliage | 51.87 |
| blossom-foliage | 33.28 |
| paving-stone | 33.21 |
| painted-timber | 32.29 |
| creature-fur | 24.48 |
| terrain-ground | 23.66 |
| bamboo-foliage | 22.98 |
| shore-rock | 20.07 |
| distant-rock | 16.60 |
| ocean-surface | 14.72 |

Global mean 13.172. Worst semantic confusion `geography->horizon` on
`oblique-north` at 2.59 per cent.

The fixed-camera layer, against `scene-quality-baseline-v1.2`:

| metric | value | threshold | worst row |
| --- | --- | --- | --- |
| group silhouette IoU | 0.452862 | 0.724931 | — |
| worst group silhouette IoU | 0.067961 | 0.369228 | `paths` @ oblique-north |
| group contour distance p95 | 29.549102 | 6.536774 | — |
| worst group contour distance | 223.9112 | 39.2559 | `paths` @ topDown |
| group depth p95 | 21.219442 | 8.173471 | — |
| worst group depth p95 | 117.194494 | 22.354947 | `structures` @ authoredOverview |
| group world normal p95 | 79.738478 | 58.959694 | — |
| semantic agreement | 0.940319 | 0.987465 | — |
| worst camera semantic agreement | 0.906555 | 0.974068 | `authoredOverview` |
| worst semantic confusion fraction | 0.025947 | 0.006534 | — |

**Per group, averaged over the six cameras — this is the table to pick work
from.** `ratio` is candidate pixels over reference pixels, so it says whether a
group is absent, right-sized, or over-drawn, which an IoU alone cannot.

| group | IoU | contour p95 | depth p95 | ref px | cand px | ratio |
| --- | --- | --- | --- | --- | --- | --- |
| cover | 0.0140 | 30.6 | 20.2 | 16,739 | 11,714 | 0.70 |
| paths | 0.1765 | **111.3** | 0.6 | 465 | 1,457 | **3.13** |
| rocks | 0.3371 | 25.5 | 3.6 | 8,649 | 8,584 | 0.99 |
| plazas | 0.3671 | 17.8 | 5.7 | 64,583 | 122,177 | **1.89** |
| bridges | 0.3695 | 20.4 | 20.7 | 12,915 | 27,191 | **2.11** |
| wildlife | 0.3986 | 40.3 | 1.6 | 659 | 512 | 0.78 |
| decorations | 0.4279 | 14.6 | 24.9 | 13,674 | 20,742 | 1.52 |
| structures | 0.4999 | 14.0 | **58.7** | 57,543 | 51,533 | 0.90 |
| vegetation | 0.7157 | 11.0 | 31.8 | 331,599 | 368,440 | 1.11 |
| horizon | 0.7927 | 21.2 | **67.7** | 548,047 | 534,130 | 0.97 |
| geography | 0.9391 | 17.0 | 5.7 | 5,670,255 | 5,591,769 | 0.99 |

`nativeAppearance` is `blockedBy: ["worldGeometry", "fixedCameraGeometry"]`, which
is ADR-0040's ordering rule and not a missing calibration. The two states are
distinguished by `reason` and `blockedBy`, and the red check asserts the
difference. Certification reports `foundation=PASS candidate=RED (worldGeometry,
fixedCameraGeometry, nativeAppearance)` against baseline
`scene-quality-baseline-v1.2`.

For contrast, the whole-frame numbers on the same capture: silhouette IoU 0.9969,
contour p95 2.5, world normal p95 4.86 degrees. All three look close to perfect
while the per-group figures above are nowhere near. None of them is gated.

## Next steps

**Ticket 03, terrain, and it is the unblocker.** `paths` now owns two of the ten
fixed-camera gates — worst group silhouette IoU 0.067961 and worst group contour
distance 223.9112, the position `cover` held before ADR-0053 — but it cannot be
fixed in ticket 06. Measured at the entities' own anchors, the terrain misfit
beneath the group is 4.73 units mean against a mean slab thickness of 0.67:
**37 of 60 paving slabs float entirely above the candidate terrain, 13 are fully
buried, and 10 intersect it.** A floating slab shows its top and all four sides
where the reference shows a sliver, which is the whole 3.13-fold over-draw.
Re-settling them would move the Scene Placement Anchor, which the spec makes a hard
contract and which is currently exact for all 672 entities, so the fix is ticket
03's terrain and nothing else. Ticket 06's `rocks` — pixel ratio 0.99, IoU 0.3371 —
is the one part of it that is actionable now, because its 8.40-unit thickness is
comparable to the misfit beneath it.

Read the per-group table above rather than the old ranking. `plazas`' reference
mask was 84 per cent scatter before ADR-0053, so any note about plazas written
earlier was measured against the wrong thing.

- **The surface sampler is fixed (ADR-0055) and it was the largest single lever on the
  world-geometry layer.** The budget belonged to each mesh and its formula is
  sub-linear and floored, so a small part drew far more points than its share of the
  geometry and the metric depended on how a form is divided into parts — which
  penalised the semantic part structure a generator is required to have. The budget now
  comes from an entity's total triangles and is split across its meshes in proportion,
  and the reference side stopped keeping its own copy of the rule: it applied the same
  formula per *renderable*, so an authored placement of five meshes drew five budgets
  and one of a single mesh drew one.
  Result: `surface p95` mean **9.3025 to 7.2469**, `bamboo` **29.01 to 7.34**, `bridge`
  28.21 to 19.28, and the worst directional ratio 9.55 to 6.79. Two gated numbers moved
  the other way — worst entity 143.10 to 155.20 and over-tolerance 0.5925 to 0.6219 —
  which is what a corrected measurement does, and the thresholds were re-derived with
  it because the reference is on both sides of every world-space control.
  `bamboo`'s remaining 6.79 ratio is not a sampler artefact: the authored clump spends
  three parts in a thousand of its triangles on culms and the candidate about 13 per
  cent, so a candidate with visible stems cannot match the authored allocation. That is
  a representation tension, not a defect.
- **Ticket 10 is done and its lesson is the sampler's twin.** The 14 entities missing
  parts were all pandas: the authored rig is 15 meshes and the generator emitted 6, or 7
  on a coin flip. The topology was measured before anything was built and every rig has
  the same one — 3 body masses in a chain along its own long axis, 4 legs of 3 stacked
  segments, mirrored across it — so what crossed into production is ~20 fractions of the
  Target AABB Extent and a program, not a table.
  `worst component deficit` 9 to **0** against its 3.5 threshold, entities missing parts
  14 to **0**, and `panda` surface p95 1.2691 to **1.1581**. `panda-statue` is one merged
  204-triangle authored mesh with no deficit to fix and improved anyway, 1.8857 to
  **1.7037**, so it keeps no special case.
  Two things to know before touching it: the rigs face their own local **-Z** (asserted,
  because building the head at +Z satisfies the extent contract exactly and puts every
  head where its tail is), and the proportions come only from the two yaw-0
  representatives, because a yawed placement's authored AABB bounds the rotated form and
  its axes are not the rig's own. The remaining component *delta* of 14 is deliberately
  ungated: nearly every authored object here is a single merged mesh, so gating the delta
  would pay a generator to merge its parts away. ADR-0056.
- **Ticket 03's gates are a recorded count boundary (ADR-0054), not open work.**
  `tools/development/measure-terrain-form-budget.mjs` runs the production landform
  pursuit at increasing budgets. The frozen 40 forms reach full height p95 8.657;
  60 reach 7.492, 80 reach 5.937, 120 reach 4.673. Interpolating, the 5.26875 gate
  needs **about 101 landforms against a frozen budget of 40**. Each row is a greedy
  upper bound, so this is strong evidence of a budget boundary rather than the proof
  ADR-0052 had, and no ADR is written on it yet.
  The **shore** gate is a different result and the more important one: shore p95
  flattens at 4.976 by 160 forms and 4.121 by 320, against a threshold of 2.85035,
  so **more landforms will never reach it**. The cause is this ticket's own
  fine-scale constraint — scales finer than the base radius are refused beyond
  normalised radius 0.8 to protect the coastline gate, which leaves the shore band
  with nothing but the three-number shelf. The next move inside the budget is the
  shelf's *radial* profile, not the per-node azimuthal controls an earlier note
  proposed: measured over 24 azimuths the shore signed bias runs -4.9 to +6.6 against
  an absolute p95 of 8.89, so the azimuthal term is the smaller one.
- **Ticket 15's blocker was ours, not the host's (ADR-0059).** It was carried as
  blocked on Firefox and Safari not being installed. `smoke-local-scene.mjs` passes
  `--use-angle=swiftshader --enable-unsafe-swiftshader` on **every** launch, so every
  run in this milestone is software-rasterised — the frozen reference observation says
  so itself, `hostKey` `windows-edge-150-swiftshader-subzero`, `acceleration`
  `software`. A gate that rejects software rendering could not have passed on any
  number of browsers.
  This host does have a GPU: `--use-angle=default` gives
  `ANGLE (Intel, Intel(R) Arc(TM) 140T GPU (16GB) Direct3D11, D3D11)` with max texture
  16384 against SwiftShader's 8192. `scripts/run-native-gpu-evidence.mjs` asks for it
  per run through `browserArguments`, which land after the harness's flags and win, so
  **the shared harness is unchanged** and every frozen threshold keeps the SwiftShader
  determinism it was calibrated through. Two stable runs on Edge 150: 549,629
  triangles and 1,810 draw calls, matching the SwiftShader counts exactly, which is
  the useful cross-check because geometry is generated on the CPU.
  It re-baselines nothing. A GPU host is a *different host*, not a better measurement
  of the same one, so the record is shaped for `describeNormativeHost` and stays out of
  every threshold.
  **Chrome is not installed** — no binary, no `App Paths` entry, nothing on `PATH` —
  and it would have been the same engine, ANGLE and adapter as Edge anyway. Firefox and
  Safari are still out of reach for a deeper reason than installation: Gecko speaks
  WebDriver BiDi and WebKit the WebKit inspector protocol, so **the CDP harness cannot
  drive either and a BiDi transport is the work**. Both are recorded as `unavailable`
  with the command that would run them.
- Ticket 05 is **landed** and its remaining red is a recorded boundary, not
  unfinished work. Do not re-open it as a fitting problem; the next move is the
  shared form family described above.
- **The plazas group is fixed and it says how the rest of the village goes.** ADR-0057:
  the over-draw was footprint coverage, not terrain — the generator filled its bounding
  rectangle and the authored plates cover 1.000, 0.341 and 0.126-0.191 of theirs. A
  candidate cannot cover less by shrinking, because `placeEntity` scales its AABB onto
  the declared extent exactly, so lower coverage comes from concavity; and coverage
  alone cannot pick the shape, because a perimeter walk and crossing paths of equal
  area sit at reach 0.71 and 0.28. Two measured scalars per entity — `footprintCoverage`
  and `perimeterShare`, the latter inverted from the authored reach — and a walk plus
  crossing paths that degenerates to a filled plate at full coverage.
  `plazas` pixel ratio **1.89 to 1.12**, IoU 0.367 to 0.398, contour 17.63 to 13.24,
  `plaza` surface p95 42.75 to 34.05, and **nine of the ten gated rendered metrics
  improved** — against the previous village attempt which regressed six of eight. The
  difference is that this one was validated on the layer it was meant to fix.
- **An over-drawing group was propping up its neighbours, and that changes how to read
  the per-group table.** With the plaza shrunk to its measured footprint, `paths`
  contour fell 111.5 to 81.1 and `geography` 16.7 to 12.4, while `rocks` contour nearly
  **doubled** — 25.6 to 47.9 — and `bridges` IoU slipped 0.370 to 0.360. None of those
  generators changed; the plaza had been covering them. So a per-group score measured
  while a neighbour over-draws is not independent of that neighbour, and the ranking has
  to be re-read after each over-draw is fixed. `bridges` at 2.22 is the last man-made
  over-draw left, so `structures` and `decorations` are still being flattered.
- **`rocks` is fixed, and it paid back ADR-0057's only regression (ADR-0058).** The
  scene generator was building a jittered sphere where the accepted Bounded
  Support-plane Polyhedron belonged. Measured along the 24 canonical directions the
  candidate averaged 0.8382 against the authored 0.9412 and sat **inside** the
  reference in 23 of 24 directions — a sphere in a box touches the six face centres
  and falls short everywhere else. The authored profile reaches 0.95-1.05 in the eight
  upward-leaning directions against 0.86-0.99 horizontally: a boxy mass filling its
  upper corners.
  `rocks` contour p95 **47.93 to 24.06**, IoU 0.359 to 0.380, world normal 83.34 to
  68.74; and in the stack, worst group contour **186.24 to 151.62** and group world
  normal p95 80.41 to **79.21**, below where it stood before the plaza change.
  The polyhedron is evaluated radially — the boundary along a ray is the minimum of
  `support[i] / (ray · direction[i])` — so the hull construction in
  `objects/stone-generator.js` is not duplicated; that file is hash-frozen under
  `stone-geometry-baseline-v2`. The *direction set* is imported rather than restated,
  and the cost is declared: that module is now in `PERMITTED_RUNTIME_PATHS` and
  `PRODUCTION_FILES`, the graph is 13 production files, and the scene runtime is
  deliberately coupled to another milestone's frozen artefact.
  Two residuals are named, not smoothed: the rock now **over**-draws at 1.26 with a
  3.6 per cent profile overshoot, because it is built to reach a 96-sample
  underestimate and then normalised onto its box, and one direction is 0.188 out.
- **`bridges` was attempted and reverted, and the finding is worth more than the
  attempt.** Two of its three controls came free from ADR-0057 and the third fell out
  of evidence already on disk: the two bridges agree on their profile *spread* (0.1842
  and 0.1871) and differ two-fold on where the band sits (`deckHeight` 0.712 against
  0.443), so the spread is a family constant and only `deckHeight` is per-entity.
  Built as a plate at that height it took the group's pixel ratio 2.22 to **1.58**,
  contour 20.49 to 19.00, depth 20.77 to 18.44 and normals 106.97 to 90.11 — and its
  **IoU 0.362 to 0.295**, dropping the aggregate `group silhouette IoU` from 0.4699 to
  0.4637. Reverted, exactly, with the evidence restored from the commit.
  The cause is diagnosed and it is ADR-0057's own trap met from the other side:
  coverage matched, *placement* of that coverage not. The rectangle decomposition had
  already said so — the two largest rectangles of each bridge lie along axes at
  **-119.2 and +136.1 degrees**, so the two bridges run along opposite diagonals of
  their boxes. A centred cross-and-walk plate cannot be either.
  Next attempt: a deck **band along a measured axis**, not a plate. The axis is a
  fourth per-entity control, measurable from the decomposition, and it deserves its own
  step rather than a bolt-on — which is why the three controls are in ticket 07 rather
  than left in the recipe as dead data.
- **`decorations` was the last unexplained man-made over-draw and two of its kinds are
  fixed (ADR-0060).** It is 19 kinds over 58 placements with the pixels concentrated:
  `npc-statue` 835, `lantern` 737, `name-plate` 659, `yin-yang` 505, nothing else above
  250. Ten lanterns and eight statues carry 48 per cent of the group's authored pixels
  and are the only two kinds with enough placements for a family program; the rest are
  mostly single placements, which is the evidence thinness that sank the bridge.
  Both were built **inverted**. The authored lantern is widest at three to five tenths
  of its height (0.89, 0.86, 0.91) and narrowest at the crown (0.44); the generator was
  a thin post under a wide housing, 0.16 at the bottom and 1.00 near the top. The
  authored statue is broad through its lower two thirds and still 0.51 at the crown
  where a sphere gave 0.22, and it put 23.9 per cent of its geometry in the bottom
  decile against the reference's 10.2.
  Ten numbers per kind, pooled, built as **one revolved surface** — the direct lesson of
  the reverted architecture attempt, which matched its profile and raised contour a
  fifth by adding seams a smooth authored body does not have.
  `decorations` IoU 0.429 to **0.452**, contour 12.97 to 12.84, normals 117.43 to
  **110.77**; `lantern` surface p95 4.384 to **3.407**. In the stack every changed
  metric improved and none regressed — the first village change this milestone to manage
  that — and draw calls fell 1,810 to **1,766** because two kinds went from three and
  four primitives to one surface each. The pixel ratio went 1.52 to 1.60, the same trade
  the support-plane rock made: a fuller form draws more while agreeing better in shape.
- **The rest of the village is still blocked on a design decision, not on a form.**
  Read ticket 07's findings before touching it. The short version:
  `plazas` draws 1.89 times the reference's pixels and `bridges` 2.11 because the
  authored plates do not fill their boxes — measured by scan-conversion in the
  reference page, coverage is 1.000 and 0.341 for the two plazas, 0.568 and 0.432 for
  the two bridges, and 0.126 to 0.191 for the decks.
  Three things follow. A candidate **cannot** cover less by shrinking, because
  `placeEntity` scales its AABB onto the Target AABB Extent exactly, so lower coverage
  must come from concavity. The decks are **not rectangle-decomposable** — no rectangle
  reaches half a per cent of the box on any of them — so they are planks and railings
  and want a walkway family rather than a plate. And each of those pairs is **two
  different assets that the recipe cannot distinguish**: the plazas differ threefold in
  coverage, the bridges have opposite vertical massing (9.8 against 62.7 per cent of
  their area below mid-height), and the recipe carries only anchor, extent, orientation
  and material. Any single unparameterised program is wrong for one of each pair, and
  two placements is too few to fit a split threshold on, so the honest route is a
  compact per-entity form control in the recipe.
  Do not thin a plaza toward the measured coverage without matching **where** the
  coverage is: filling the box scores IoU = the reference's coverage exactly, which is
  the 0.367 already observed, and covering the right fraction in uncorrelated places
  scores about 0.21. The pixel ratio reports that regression as a fix. The plates are
  all centred to within 0.03-0.08 of their box centres, so a centred correction is
  correlated and escapes that penalty — that is what makes the ticket tractable.
- Ranked by **relative** error the village is not special. Divided by each kind's own
  diagonal, every kind's `surface p95` sits between 10 and 33 per cent, and `mountain`
  (9.6%) and `bamboo` (10.9%) are the best while `stone-block` (33.1%) and
  `dumpling-house` (29.9%) are the worst. The absolute ranking is mostly a ranking of
  size. Weighted by entity count the whole village is about 10 per cent of the aggregate
  `surface p95` against `mountain`'s 34 and `palm`'s 21, so village work has to be
  justified on the fixed-camera layer and human review, not on the world-geometry gate.
- Ticket 07's own massing findings were measured through the pre-ADR-0055 sampler. The
  signs survive because the reference was allocated the same way, but re-measure before
  trusting the magnitudes.
- **Ticket 11 is part done and its remaining half is geometry's.** Every family's
  albedo was hand-written, and the authored materials cannot correct one directly
  because the colour is in maps: all 236 palm placements are 0xffffff with a texture.
  `tools/development/measure-material-albedo.mjs` measures each family's area-weighted
  mean linear reflectance from those maps and from base colours where there is no map,
  and the recipe carries the result — global appearance DeltaE 13.168 to 12.504,
  `palm-foliage` 54.84 to 38.87, and `distant-rock` converged at [179 177 163] against
  a reference [179 176 161].
  `palm-foliage`'s remaining 2.9-fold brightness gap is **not** colour. Its material is
  measured and its render is still bright because a dense authored canopy shadows
  itself and the candidate's does not. `measure-appearance-direction.mjs` reports that
  residual and is deliberately report-only: it began as a fitting loop, and the albedo
  it wanted was darker than the authored material actually is, which is material
  standing in for geometry.
  Still open: roughness, transparency and emission are declared rather than measured
  although the authored materials record roughness as a scalar, and there are no
  bounded semantic pattern programs at all — every family is one flat colour.
- The browser-in-the-loop harness this file kept asking for exists, and the lesson from
  building it is that a loop was the wrong instinct for appearance. What 06, 07 and 11
  needed was not a faster search but the *direction* of each residual, which the pass
  did not record, and then a measurement of the authored material rather than a fit
  against the render. Anything the direction still wants once a family's material is
  measured is geometry, and fitting it would buy the appearance layer with the geometry
  layers.

## Things that are easy to get wrong

- The evidence files are inputs to the gate stack. After changing a generator,
  re-run the measurement commands before reading a report, or the report
  describes the previous candidate.
- Editing what a *pass* measures still invalidates every stored capture, including
  all sixteen calibration control partials. Editing how the per-camera, per-group
  rows are *combined* no longer does: `run-fixed-camera-calibration.mjs --aggregate`
  recomputes `aggregateCameras` from the rows stored in each partial rather than
  reading the aggregate the browser wrote beside them. That is what made ADR-0053's
  worst-group scoping change free, and it is worth keeping in mind before assuming a
  re-render is needed.
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
- Generation is currently 0.50 s and 529,390 triangles, and the production bundle is
  38,627 B gzip. Triangles fell 135,259 as a side effect of matching the authored
  bamboo triangle allocation, which is worth knowing before ticket 14 starts hunting:
  a form that spends its triangles differently from the authored one is both a budget
  problem and a surface-parity problem, and the two move together.
- `renderer.info` resets on every render call, and the composer makes several, so
  reading it after the chain measures the output pass's fullscreen quad. It reported
  1 triangle and 1 draw call, and the certification recorded that. The runtime now
  sets `info.autoReset = false` and resets once before the chain. Any future pass
  added to the chain has to keep that ordering.
- `check:scene-generation` holds an allowlist of paths the replacement may request.
  A new production module has to be added there *and* to `PRODUCTION_FILES` in the
  certification, and both are separate lists in separate files.
- A browser run occasionally dies with "browser exited before DevTools was ready"
  right after other Edge processes were killed. It is a startup race, not a code
  failure; re-run the batch.
- `test/stone-v2-calibration-contract.test.mjs` fails in this checkout and did so
  before ticket 05 touched anything — verified by stashing the whole change and
  re-running. Every one of its eleven frozen files hashes correctly once its CRLF
  line endings are normalised to LF: `visual-metrics.mjs` is 32,795 bytes on disk
  with 995 CRLFs and 31,800 bytes as LF, whose sha256 matches the frozen value
  exactly. `core.autocrlf` is `false`, so nothing is converting on checkout. It is
  a working-copy line-ending state, not a code defect, and none of the eleven
  files is one this milestone edits.
  **Settled.** The test passes 7 of 7 in a fresh `git worktree` checkout of this same
  commit while still failing in the original working copy, which confirms the
  diagnosis outright: the frozen hashes are correct and one working copy's files have
  CRLF on disk. There is nothing to decide repo-wide and nothing to re-freeze — the
  fix is to renormalise that working copy (`git rm --cached -r . && git reset --hard`,
  or re-clone). Do not re-freeze the contract to match a local line-ending state; that
  would bake one machine's checkout into a frozen artefact.
- The reference GLB can be read offline on the development side:
  `@gltf-transform/core`, `@gltf-transform/extensions` and `draco3dgltf` are
  already devDependencies and `tools/development/fit-stone-supports.mjs` is the
  pattern. That is how ticket 05 established what an authored mountain actually
  looks like, after two rounds of fitting against a guess. Look at the reference
  before designing a representation for it.
- When a measured summary is the input to a fit, check its resolution against the
  threshold first. The horizon summits come off a 12x12 grid over each group's
  box, which at 1,400 units is +/- 4.7 azimuth bins — wider than the entire 0.945
  degree budget.
- `npm run check:scene-parity-foundation` can never pass. It regenerates the
  certification report and compares it byte for byte with the stored one, and the
  report carries `generationMs`, a wall-clock timing: three consecutive runs
  against a stored 538.5 produced 540.4, 524.5 and 529.5. Structural and
  pre-existing, unrelated to any candidate change. `npm run
  certify:scene-parity-foundation` itself is fine — it writes the report and
  reports the result. Either bucket the timing, or exclude it from the byte
  comparison and assert it against a budget instead, which is ticket 14's
  business anyway.
