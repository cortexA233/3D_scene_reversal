# 01 - Calibrate the fixed-camera and native-appearance gate layers

**What to build:** Freeze thresholds for the two Scene Parity Gate Stack layers that currently have none, using declared reference-only damage rendered through the same six frozen cameras, so the stack can express a pass at all.

**Blocked by:** None - this blocks every appearance ticket and final certification.

**Status:** ready-for-agent

- [ ] Add one non-interactive check that is red while either layer has no frozen thresholds.
- [ ] Render the reference against declared perturbed clones of itself through all six frozen cameras and the Normative Scene Capture.
- [ ] Use scene-space damage, not image-space approximations, so the thresholds mean the same thing as the geometry layers'.
- [ ] Cover per-group silhouette, contour distance, linear depth, world normal, semantic occupancy and confusion, global appearance, and per-Material-Family appearance.
- [ ] Include mild controls an Exact-ish Reconstruction should tolerate and severe controls it must reject, and prove each metric separates them.
- [ ] Demote rather than loosen any metric that cannot separate its bracket.
- [ ] Prove every declared damage control is caught by at least one gating metric.
- [ ] Prove the calibration input graph contains no candidate artifact.
- [ ] Extend `scene-quality-baseline-v1` through an explicit versioned migration, leaving the existing geometry thresholds unchanged.
- [ ] Confirm the gate stack now evaluates all four layers and the candidate remains honestly red.
