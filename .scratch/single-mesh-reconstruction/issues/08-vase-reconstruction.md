# 08 — Vase end-to-end reconstruction

**What to build:** Reconstruct Vase from a compact axial profile and lathe/revolve operation with procedural appearance. This slice must demonstrate that an editable profile representation can achieve strong multi-view fidelity without copied mesh sections or authored texture data.

**Blocked by:** 07 — Stone end-to-end reconstruction.

**Status:** resolved

## Comments

Implementation in progress after preserving Ticket 07's negative visual result. Vase fitting will use a compact axial profile and will not compensate for Stone by relaxing any gate.

Resolved with a retained hollow-lathe generator and frozen acceptance evidence. The source surface-of-revolution was represented by 16 editable outer-profile controls; the inner wall is generated from semantic wall/base/rim thicknesses rather than retained sections. A 12-segment lathe preserves the authored low-poly radial character, and generated vertex colors reproduce the axial ceramic gradient without runtime texture bytes. Final evidence: mean/worst silhouette IoU `0.9946 / 0.9914`, mean/P95 edge distance `0.240 / 2 px`, depth MAE/P95 `0.00247 / 0.00656`, mean/P90 Delta E 00 `5.69 / 14.86`, mean/worst SSIM `0.925 / 0.790`, palette centroid/coverage `4.97 / 0.094`. The recipe uses 44 numeric source scalars and 574 bytes; output uses 768 triangles, one draw call, 23,484 geometry bytes, no runtime texture, and 0.2 ms warm-generation p95. Reports: `gt_designer/single-mesh-evaluation/reports/vase-acceptance-v1.json` and `gt_designer/single-mesh-runtime-audit/reports/vase-nonvisual-v1.json`.

- [x] Author a typed Vase recipe with separate profile/shape and appearance parameters, a stable semantic ID, and an explicit versioned seed.
- [x] Express the axial silhouette with a small number of semantic profile controls whose count is independent of source mesh or section-sampling resolution.
- [x] Generate the form with `LatheGeometry` or an equivalently compact project-owned revolve operation in source-scene units and the agreed Reconstruction Frame.
- [x] Add asymmetry, irregularity, or extra geometry only when frozen geometry evidence shows it is required.
- [x] Reproduce the authored textured identity procedurally without authored pixels, lookup images, dense color samples, or runtime texture bytes.
- [x] Pass per-axis bounding-box relative error of at most 2% and bottom-anchor error of at most 0.02 canonical units.
- [x] Across all twelve views, achieve mean silhouette IoU at least 0.95, worst-view IoU at least 0.92, mean symmetric edge distance at most 1.5 pixels, edge-distance P95 at most 4 pixels, depth MAE at most 1.5%, and depth-error P95 at most 4%.
- [x] Achieve mean Delta E 00 at most 8, P90 Delta E 00 at most 18, mean masked SSIM at least 0.82, worst-view SSIM at least 0.75, palette-centroid Delta E at most 6, and palette coverage L1 at most 0.15.
- [x] Keep absolute roughness error at most 0.10 and absolute metalness error at most 0.05.
- [x] Use at most 48 object-specific scalars, a 1 KB recipe, a 5 KB gzip production delta, 1,100 triangles, one draw call, 40 KB of geometry memory, and 5 ms warm-generation p95.
- [x] Pass normative and cross-browser deterministic checks and the offline Reference Independence audit.
- [x] Produce the full Evaluation Harness evidence report and retain no dense extracted profile, cross-section set, or fitting history in production.
- [x] Do not introduce a high-level operation tree unless three completed shape classes now show the same repeated composition pattern and that evidence is recorded for architectural review.
