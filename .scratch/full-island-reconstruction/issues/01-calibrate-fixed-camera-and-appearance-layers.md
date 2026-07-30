# 01 - Calibrate the fixed-camera and native-appearance gate layers

**What to build:** Freeze thresholds for the two Scene Parity Gate Stack layers that currently have none, using declared reference-only damage rendered through the same six frozen cameras, so the stack can express a pass at all.

**Blocked by:** None - this blocks every appearance ticket and final certification.

**Status:** done — ADR-0051

- [x] Add one non-interactive check that is red while either layer has no frozen thresholds.
      `node --test test/camera-appearance-calibration.test.mjs`, 15 assertions.
- [x] Render the reference against declared perturbed clones of itself through all six frozen cameras and the Normative Scene Capture.
      `scripts/run-fixed-camera-calibration.mjs`, 16 controls, `1440x810` at the frozen moment, camera matrices verified against the frozen set per capture.
- [x] Use scene-space damage, not image-space approximations, so the thresholds mean the same thing as the geometry layers'.
      Placement roots move, scale, turn, and disappear; the terrain rises; materials change. Each capture proves its own restore numerically and by re-rendering a frame and comparing it byte for byte with the undamaged one.
- [x] Cover per-group silhouette, contour distance, linear depth, world normal, semantic occupancy and confusion, global appearance, and per-Material-Family appearance.
      11 fixed-camera and 4 appearance metrics, all per-group or per-family. Contour distance is gated per group because whole-frame contour p95 measures 0 on `topDown` and 1 pixel on the four obliques.
- [x] Include mild controls an Exact-ish Reconstruction should tolerate and severe controls it must reject, and prove each metric separates them.
      The bracket reuses the world-space values — 0.15 units, 1 per cent, 0.02 radians mild; 12 units, 45 per cent, 0.9 radians severe — so mild and severe mean one thing across the stack, and `test/scene-calibration.test.mjs` asserts the two declarations cannot drift apart in class.
- [x] Demote rather than loosen any metric that cannot separate its bracket.
      `selectThreshold` is reused unchanged. Coverage now distinguishes a path that was measured and demoted, which must carry a reason, from one that was never measured at all.
- [x] Prove every declared damage control is caught by at least one gating metric.
      `undetectedControls` runs in the aggregate step and again in the red check.
- [x] Prove the calibration input graph contains no candidate artifact.
      From the page's own request log, not from a comment: the calibration page loads the reference and the harness and never the Scene Generation Module.
- [x] Extend `scene-quality-baseline-v1` through an explicit versioned migration, leaving the existing geometry thresholds unchanged.
      Contents advance to revision `scene-quality-baseline-v1.1`; the schema stays `scene-quality-baseline-v1`, which the gate stack requires. Each revision names its ADR and the geometry thresholds it moved, and that list is asserted against the file on disk. All 13 geometry thresholds are pinned by value in the red check.
- [x] Confirm the gate stack now evaluates all four layers and the candidate remains honestly red.
      Three layers are evaluated and `nativeAppearance` is `blockedBy` the failing geometry layers, which is ADR-0040's ordering rule rather than a missing calibration. "All four evaluated" is unreachable while the candidate is red and is not the goal; the red check distinguishes the two states by `reason` and `blockedBy`.

## What the calibration found

Six defects, four of them in the harness's own first cut, which is what a bracket
is for. All are recorded in ADR-0051 and the handoff:

1. Whole-frame contour distance is dead on five of six cameras.
2. `semanticConfusion.worstFraction` returned `null` when nothing was confused,
   and the gate stack reads a null as missing evidence — so a subject that
   mislabelled nothing would have failed the metric meant to catch mislabelling.
3. Contour distance against an absent group returned the distance-transform
   sentinel, 9.2e7 for a deleted village. A threshold calibrated on that would
   have accepted any candidate at all.
4. Per-pixel world-normal error was saturated: a 0.15-unit translate reached 45.75
   degrees and the candidate's 71.22 sat inside the mild band. Orientation is now
   compared only where linear depth also agrees.
5. `scaleBy` pivoted on the transform origin, so a mild 1 per cent scale displaced
   horizon ridges by 14 units.
6. `rotateY` had the same bug, worse: 0.02 radians swung a ridge through 28 units.
