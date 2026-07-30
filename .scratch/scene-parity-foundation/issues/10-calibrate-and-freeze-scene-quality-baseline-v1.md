# 10 — Calibrate and freeze Scene Quality Baseline v1

**What to build:** Use repeat Immutable Reference evidence and controlled reference-only perturbations to prove the scene metrics are stable and sensitive, then freeze the first blocking baseline before current-candidate results can influence thresholds.

**Blocked by:** 09 — Assemble the Scene Parity Gate Stack.

**Status:** done

- [x] Add one non-interactive scene-calibration check that starts red until every required Calibration Bracket separates declared mild variation from structural or appearance damage.
- [x] Freeze a calibration contract before running candidate threshold evaluation and prove the calibration input graph contains no current-candidate metrics or reports.
- [x] Run repeated identity captures and declared mild, intermediate, and severe camera, projection, clipping, aspect, device-scale, and observation-time perturbations.
- [x] Calibrate semantic deletion, duplication, reassignment, and correspondence-swap controls.
- [x] Calibrate entity translation, Target AABB Extent, heading, axis, support, and semantic-component damage ladders.
- [x] Calibrate terrain elevation, slope, ridge, plateau, channel, inlet, coastline, Semantic Sea Level, and ocean-coverage controls.
- [x] Calibrate Horizon Group deletion, placement, depth, extent, peak, saddle, overlap, and complete-profile controls.
- [x] Calibrate Material Family palette, roughness, transparency, emission, motif family, coverage, phase, and scale controls.
- [x] Calibrate Semantic Light deletion, movement, color, intensity, range, shadow, and emissive-source association controls.
- [x] Revise or demote any metric that cannot separate the bracket; do not loosen it in response to candidate failure.
- [x] Record the normative browser, OS, hardware, GPU/WebGL renderer, acceleration, color, Three.js, and observation-time environment with repeated evidence.
- [x] Freeze a schema-versioned Scene Quality Baseline v1 and calibration report whose later change requires an explicit migration and full recalibration.
- [x] Confirm native Firefox and Safari scene gates remain deferred until the candidate otherwise qualifies, without weakening the retained cross-browser requirement.
