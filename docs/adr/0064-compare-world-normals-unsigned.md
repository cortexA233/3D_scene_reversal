---
status: accepted
---

# Compare world normals unsigned

ADR-0051 repaired the world-normal metric once — restricting it to pixels where linear depth also agrees, because a sub-pixel shift makes a pixel see a different surface rather than the same surface turned — and named a second refinement it did not take: "unsigned comparison, treating a normal and its negation as one plane; that changes what the metric means and belongs in its own revision." This is that revision.

## The argument is about what a normal means

A two-sided surface has no unique outward normal. Which way its normal points is a property of how the triangle happens to be wound, not of the surface, and a Procedural Replacement is explicitly not required to reproduce source topology. Comparing signed normals on such a surface measures winding.

This island's worst offenders are exactly those surfaces. Vegetation is layered leaf blades; three of the five Distributed Scene Cover populations are two-triangle blades with no thickness at all; the decorations are thin props.

## What the measurement says

The reduction lands on thin double-sided geometry and nowhere else, which is the signature of sign flips rather than of a loosened tolerance:

| group | signed p95 | unsigned p95 | |
| --- | --- | --- | --- |
| vegetation | 120.7 | **80.4** | 33% lower |
| decorations | 107.9 | **77.8** | 28% |
| structures | 104.6 | 85.9 | 18% |
| cover | 102.5 | 85.0 | 17% |
| horizon | 87.3 | 82.2 | 6% |
| wildlife | 73.6 | 66.9 | 9% |
| rocks | 69.0 | 68.7 | **0%** |
| plazas | 17.1 | 17.0 | **1%** |
| geography | 0.9 | 0.9 | **0%** |

Solid geometry does not move. If this were a tolerance being relaxed, everything would move together.

## It stays discriminating, and it costs the candidate

Re-derived from the same twelve reference-only geometry controls, by the unchanged selection rule, with the controls and their damage magnitudes untouched:

| | worst mild | best declaring severe | ratio |
| --- | --- | --- | --- |
| signed | 51.485 | 77.864 | 1.51 |
| unsigned | 35.229 | 62.292 | **1.77** |

The limit **falls** from 58.95938 to **41.994434**, a 29 per cent tightening, because the unsigned comparison lowers the mild bracket more than the severe one — the mild controls' error is disproportionately sign flips on thin geometry, which is the whole reason for the refinement.

And the candidate is worse off. It reads **65.363956 unsigned against 41.994434**, failing by 56 per cent, where it read 76.948763 against 58.95938 and failed by 30. **A refinement that costs the candidate margin cannot be a threshold loosened to reach green**, and that is the strongest thing that can be said for taking it. No gate changed state.

`worst group world normal p95` stays demoted. Under unsigned comparison mild reaches 89.79 and declared damage 89.60, so it still cannot tell them apart — a maximum over every camera and group always finds a group of thin props a few pixels across. That is unchanged by this revision and remains ADR-0051's finding.

## What is kept

The signed comparison is retained beside the unsigned one as `signedMeanP95` and `signedWorst`, because the *gap between them is the evidence*: a capture where the two agree has no double-sided geometry in frame, and where they diverge the difference is the sign flips. Deleting the number that motivated the change would leave the next reader unable to check it.

## Two things this cost, both declared

Editing anything in `scene-pass-metrics.mjs` invalidates every stored capture, so the twelve geometry controls were re-run. Every one reproduced its stored *signed* value to four decimal places — `translate-0.15` at 44.465198 against 44.465423 — which is the check that the addition was additive. The fifth-decimal drift that produced still had to be declared, as `scene-quality-baseline-v1.5`, before this revision could be: 58.959694 to 58.95938, SwiftShader's own last-digit noise, and stricter.

A smaller asymmetry surfaced and is worth knowing. `run-fixed-camera-calibration.mjs --aggregate` recomputes `aggregateCameras` from the rows stored in each control partial, so a change to how rows are *combined* is free on the calibration side. The candidate's `scene-passes-v1.json` has no such mode — the browser writes its aggregate at capture time — so the six-camera passes had to be re-captured for a change that touched no pass. An offline re-aggregate for the candidate side would make the two symmetrical.
