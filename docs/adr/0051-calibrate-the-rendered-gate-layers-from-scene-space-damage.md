---
status: accepted
---

# Calibrate the rendered gate layers from scene-space damage, and gate them per group

The `fixedCameraGeometry` and `nativeAppearance` layers of ADR-0040's
non-compensating stack are frozen for the first time, from declared reference-only
damage applied to the reference's own scene graph and rendered through the six
frozen cameras of ADR-0049. The Scene Quality Baseline's contents become revision
`scene-quality-baseline-v1.1`; its schema stays `scene-quality-baseline-v1`, which
is what the gate stack requires. No existing threshold moves, and the revision
declares that in `migrations[].movedGeometryThresholds` so the claim is checked
rather than asserted in prose.

Until now both layers held `[]`. An empty layer cannot pass — `evaluateLayer`
refuses to pass vacuously — so the stack could not express a pass at all and every
appearance ticket was blocked behind a layer nothing had ever been measured
against.

## The damage is applied in the scene, not to the image

A threshold is only comparable to the result it gates if both were produced the
same way. The world-space layers are calibrated by perturbing a measured
observation, which works because the metric consumes that observation. The
rendered layers consume pixels, so their damage has to reach the pixels the same
way a wrong candidate would: placement roots move, scale, and turn, buildings
disappear, canopies shrink, the terrain rises, and materials change, and then the
frame is captured. Dimming pixels or shifting a mask would produce a number that
looks like the acceptance number but does not mean the same thing.

The bracket values are the world-space bracket's values — 0.15 units, 1 per cent,
and 0.02 radians for mild; 12 units, 45 per cent, and 0.9 radians for severe —
because "mild" and "severe" have to mean the same damage in every layer of a
non-compensating stack. Only the mechanism differs. The controls apply to every
placement root including the horizon ridges, which is the property the baseline
already records for the world-space bracket. Appearance has no world-space
counterpart to borrow from, so its bracket is declared here: a one per cent albedo
shift is mild, and replacing every material with its own luminance is severe.

Calibration is the one place that mutates the Assembled Authored Scene, which
ADR-0037 otherwise forbids. What makes that legitimate is not a promise. Each
capture snapshots every world matrix, visibility flag, and material colour it is
allowed to touch, audits them after restoring, and then re-renders a frame and
compares it byte for byte with the undamaged one. A run that cannot prove its own
restore is rejected, because every later control in the same session would have
been measured against a damaged baseline. `verifyScenePassProtocol` still refuses
a mutated reference; the calibration run is verified by
`verifyCalibrationCaptureProtocol` instead, and both share one implementation of
the frozen-camera checks.

Reference-only is likewise proven rather than claimed. The calibration page loads
the reference and the harness and never the Scene Generation Module, and the
driver records the module graph the page actually fetched and fails on any
candidate module in it.

## Every gated metric is per group or per family

Whole-frame silhouette IoU is excluded, and so is whole-frame contour distance.
Both are dominated by geography, which fills 84 to 86 per cent of every auxiliary
frame. Measured on the frozen reference passes, whole-frame contour distance p95
is 0 on `topDown` and 1 pixel on all four obliques, because the whole-frame
silhouette is everything that is not sky and its outline is essentially the frame
border. It reports agreement no matter what the island looks like. That is the
blind spot ADR-0049 removed, in a second metric, and gating it would have brought
the blind spot back through the calibration that was meant to close it.
`aggregateCameras` therefore reports `groupContourDistance` alongside the existing
per-group IoU, depth, and normal aggregates, and that is what the layer gates.

Two consequences follow, and both are wanted. The thresholds are demanding,
because the mild bracket sits at the harness's own repeatability: the identity
control reports per-group IoU exactly 1, contour distance 0, depth 0, world normal
1e-6 degrees, and DeltaE 0. And the current candidate fails them by a wide margin,
which is the honest reading of a per-group IoU of 0.422.

A metric that cannot separate its bracket is demoted to diagnostic and does not
gate. `verifyLayerCoverage` then reports its whole family as ungated, so demotion
surfaces as a hole rather than passing quietly — a family with every member
demoted is a category of visible error nothing checks. It also distinguishes a
path that was measured and demoted, which has to carry a reason, from one that was
never measured: without that distinction a calibration could freeze whichever
metrics happened to separate and say nothing about the rest.

## What was frozen

Fourteen metrics gate and one is demoted.

| layer / metric | direction | threshold | mild worst | damage best |
| --- | --- | --- | --- | --- |
| group silhouette IoU | atLeast | 0.745598 | 0.863603 | 0.391582 |
| worst group silhouette IoU | atLeast | 0.302569 | 0.341028 | 0.187192 |
| group contour distance p95 | atMost | 5.874122 | 1.990077 | 17.526255 |
| worst group contour distance | atMost | 39.2559 | 19.7278 | 97.8402 |
| group depth p95 | atMost | 7.644414 | 2.31585 | 23.630105 |
| worst group depth p95 | atMost | 22.354947 | 21.639703 | 24.500678 |
| group world normal p95 | atMost | 49.456982 | 39.368247 | 79.723186 |
| semantic agreement | atLeast | 0.987474 | 0.989419 | 0.981639 |
| worst camera semantic agreement | atLeast | 0.974085 | 0.980686 | 0.954283 |
| worst semantic confusion fraction | atMost | 0.007092 | 0.006142 | 0.009943 |
| appearance DeltaE mean | atMost | 2.852463 | 0.327325 | 10.427875 |
| worst camera appearance DeltaE | atMost | 4.228213 | 0.5577 | 15.239753 |
| material family appearance DeltaE mean | atMost | 5.961796 | 0.515557 | 22.300514 |
| worst material family appearance DeltaE | atMost | 4.062021 | 1.263066 | 12.458887 |

`worst group world normal p95` is demoted: mild variation reaches 174.07 degrees
while the declared damage reaches 167.61, so it cannot tell them apart in either
direction. The depth-correspondence restriction removed the saturation from the
aggregate — which separates 39.37 from 79.72 — but not from the worst-case form,
because taking the maximum over every camera and group always finds a group of
thin double-sided props, and among the pixels where depth agrees within 2 units
some still pair a front face against a back face. `decorations` is 58 small props
covering a few pixels each on an oblique camera and it reaches 171 degrees under a
one per cent scale.

The world-normal family is still gated, by its aggregate, and the property that a
good aggregate cannot hide a failed group is retained by the silhouette, contour,
and depth families, whose worst-case forms all separate by wide margins. The
declared next refinement is to compare orientation unsigned, treating a normal and
its negation as one plane, since which side of a double-sided surface is visible is
not a property a candidate should be judged on. That is a change to what the metric
means and belongs in its own revision rather than in this one.

Three thresholds are tight, and the bracket is why rather than an accident:
`worst group depth p95` sits between 21.64 and 24.50, `semantic agreement` between
0.9894 and 0.9816, and `worst semantic confusion fraction` between 0.00614 and
0.00994. A threshold is what the declared damage supports. Widening one because it
looks uncomfortably close would be the loosening this milestone forbids.

## World normal is compared only where both subjects see the same surface

Per-pixel world-normal error over the silhouette intersection is saturated at this
scene's scale and cannot be gated as it stood. Measured through the frozen
cameras, a 0.15-unit translate — a fifth of a pixel at the auxiliary cameras'
standoff — produced a per-group p95 of 45.75 degrees, and a one per cent scale
69.57, with individual groups reporting 151 degrees. An angle above 90 degrees is a
normal that flipped, not one that rotated.

The cause is that the metric conflated two different things. Most pixels in these
frames sit on geometry one or two pixels across — leaves, railings, path stones —
so a sub-pixel displacement makes a pixel see a *different surface* rather than
the same surface turned, and the reported angle is then the angle between two
unrelated faces. Coherent surfaces behave perfectly: geography, cover, and plazas
report 1e-6, 1e-6, and 0.6 degrees under the same control. The saturation is
specific to thin, dense geometry, and this island is mostly that.

The consequence is that mild damage, severe damage, and the real candidate all
land in one band: the candidate's 71.22 degrees sits inside the mild bracket. A
threshold frozen there would gate nothing while looking like a gate.

`worldNormalEvidence` therefore compares orientation only where the linear depth
also agrees, within 2 world units — the world-geometry layer's own `surface p95`
limit is 2.3479, so agreeing to within 2 units is already "the same surface"
everywhere else in the stack. That makes the metric mean what its name says. The
unrestricted value and the corresponding-pixel fraction are both still reported,
so a restriction that discarded most of a frame surfaces instead of looking like
agreement.

This is the ADR-0045 path rather than a threshold change: a metric blind spot found
by reference-only calibration becomes better reference-only evidence and a
versioned gate revision.

## Two further defects this found

Scaling a placement root by `object.scale` alone pivots on its transform origin,
which is not where its geometry is. A horizon ridge whose geometry sits 1400 units
from its origin moves 14 units when scaled by one per cent, so the mild
`extent-1pct` control was displacing the ridges far enough to report up to 47
degrees of normal error and a per-group IoU of 0.685 — severe damage wearing a mild
control's name, which would have widened the mild bracket until nothing failed it.
Scaling now pivots on each root's own bounding-box centre, matching the world-space
bracket's `scaleEntities`.

`semanticConfusion.worstFraction` reported `null` when no pixels were mislabelled
at all. The gate stack reads a null as missing evidence and fails the metric, so a
subject that confused nothing would have failed the metric that exists to catch
confusion. It now reports 0 when pixels were compared and none were confused, and
reserves null for a capture that compared no pixels. This was invisible while the
candidate was red on every camera and would have appeared only at the end, which
is the shape of defect this milestone's history keeps producing.


## The declared unsigned refinement is measured, and it should be adopted

This record demoted `worst group world normal p95` and named the way forward: "unsigned
comparison, treating a normal and its negation as one plane; that changes what the metric
means and belongs in its own revision." It is now measured, as a **diagnostic** reported
beside the signed value, and it changes nothing that gates.

The argument was always about what a normal *means* rather than about tolerance: a two-sided
surface has no unique outward normal, and this island's worst offenders are exactly those.
The measurement bears that out — the reduction lands on thin double-sided geometry and
nowhere else:

| group | signed p95 | unsigned p95 | |
| --- | --- | --- | --- |
| vegetation | 120.7 | **80.4** | 33% lower |
| decorations | 107.9 | **77.8** | 28% |
| structures | 104.6 | 85.9 | 18% |
| cover | 102.5 | 85.0 | 17% |
| rocks | 69.0 | 68.7 | 0% |
| plazas | 17.1 | 17.0 | 1% |
| geography | 0.9 | 0.9 | 0% |

Solid geometry does not move at all. Vegetation is layered leaf blades and three of the five
cover populations are two-triangle blades with no thickness.

**It stays discriminating, and by a wider relative margin.** From the twelve re-captured
geometry controls:

| | worst mild | best declaring severe | ratio |
| --- | --- | --- | --- |
| signed | 51.485 | 77.864 | 1.51 |
| unsigned | 35.229 | 58.271 | **1.65** |

**And it makes the gate stricter for the candidate, which is the point worth recording.** The
candidate's unsigned aggregate is 65.364 against a bracket whose limit must sit below 58.271
— so it fails by about 40 per cent where the signed metric fails by 30. A refinement that
cost the candidate margin cannot be a threshold loosened to reach green, and that is the
strongest thing that can be said for adopting it.

Recommended, as its own revision: gate the unsigned value, re-derive the limit from the
bracket above by the unchanged selection rule, and demote or keep the signed value as the
diagnostic. Nothing about the controls, their magnitudes, or the rule changes. It was not
taken here because it is a frozen-threshold change and deserves a session that starts with
it rather than one that ends with it.
