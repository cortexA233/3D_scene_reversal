# 04 — Quality Baseline calibration and visual gates

**What to build:** Turn the Evaluation Harness captures into trustworthy visual acceptance. Implement and validate the metrics, run reference-repeatability and controlled-perturbation experiments, then freeze the Stage 1 Quality Baseline before any Stone Path fitting begins.

**Blocked by:** 03 — Fixed-view Evaluation Harness.

**Status:** resolved

- [x] Implement per-axis bounding-box error, bottom-anchor error, full-image silhouette IoU, bidirectional symmetric contour distance, and linear-depth error normalized by the seven-unit canonical maximum dimension.
- [x] Implement CIEDE2000 color error, two-pixel-eroded masked SSIM, dominant-palette centroid and coverage comparisons, roughness error, and metalness error using documented color-space and mask conventions.
- [x] Report every metric per view, as a view-set mean, and as a worst-view or declared percentile; missing and extra silhouette pixels must not be hidden by intersection-only metrics.
- [x] Provide analytically checkable synthetic fixtures for masks, contours, depth, color, percentiles, palette coverage, and worst-view aggregation.
- [x] Measure repeated unperturbed Authored Reference captures to establish renderer and capture repeatability.
- [x] Measure controlled scale changes of plus or minus 1%, 2%, and 5%; canonical pivot offsets of 0.01, 0.05, and 0.10; and rotations of 1, 3, and 5 degrees.
- [x] Measure meaningful component deletion, reduced profile or radial resolution where applicable, and controlled known color differences.
- [x] Verify that metric results order controlled perturbations sensibly and expose the intended failure types.
- [x] Permit at most one documented correction to a mathematically defective, unstable, or incorrectly ordered metric or initial threshold before replacement fitting starts.
- [x] Freeze and version the final Stage 1 numerical Geometry and Appearance Quality Baseline from the accepted specification; later replacement failures must not relax it.
- [x] Enforce geometry gates before appearance gates so procedural appearance cannot compensate for failed bounds, silhouette, edge, or depth evidence.
- [x] Report world-normal angular error, surface area, valid volume, and geometric Hausdorff or Chamfer evidence diagnostically without turning them into uncalibrated Stage 1 hard gates.
- [x] Emit a non-interactive, machine-readable calibration and gate report with a failing exit status for protocol or hard-gate failure.

## Answer

Implemented and froze `single-mesh-quality-baseline-v1` without using the one permitted pre-fitting correction. The retained browser calibration uses Authored Reference copies only: all four Stage 1 objects pass byte-stable repeated captures and identity-copy gates; Stone Path scale, pivot, rotation, and color perturbations order by severity; Vase eight- and four-segment radial reductions order correctly; and deleting Umbrella's largest non-dominant connected component exposes silhouette, contour, surface-area, and topology loss.

The machine-readable report retains all twelve per-view results, aggregate and worst-view evidence, capture checksums, material comparisons, and diagnostic world-normal, canonical surface-area, valid-volume, and vertex-set Chamfer/Hausdorff measurements. It records 29 passing calibration checks, zero corrections, Three.js 0.170.0, and the normative headless Chrome 150 SwiftShader path. Geometry gates now short-circuit appearance evaluation with the explicit reason `geometry-gate-failed`.

Run `npm run accept:ticket-04` to execute 39 unit and contract tests, verify the eight-object Ground Truth report, launch a fresh offline-local browser calibration, compare its versioned threshold definition with the frozen report, and fail nonzero on any protocol, repeatability, sensitivity-ordering, policy, identity-gate, or baseline mismatch.
