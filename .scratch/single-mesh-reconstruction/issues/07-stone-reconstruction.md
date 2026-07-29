# 07 — Stone end-to-end reconstruction

**What to build:** Reconstruct the closed low-poly Stone as a compact deterministic volume with fixed-seed deformation. The result must validate the workflow on a less regular silhouette while preserving the same Object Generator, Evaluation Harness, and Reference Independence contracts.

**Blocked by:** 06 — Stone Path end-to-end reconstruction.

**Status:** resolved

- [x] Author a typed Stone recipe with separate shape and appearance parameters, stable semantic IDs, and explicit versioned seeded deformation.
- [x] Generate a compact closed polyhedral base and deterministic deformation whose topology and branches do not depend on ambient randomness or external call order.
- [x] Keep deformation controls semantic and resolution-independent rather than retaining source vertices, point samples, or fitted displacement arrays.
- [x] Reproduce Stone appearance procedurally with no authored texture or runtime texture bytes.
- [x] Pass per-axis bounding-box relative error of at most 2% and bottom-anchor error of at most 0.02 canonical units.
- [ ] Across all twelve views, achieve mean silhouette IoU at least 0.92, worst-view IoU at least 0.88, mean symmetric edge distance at most 2.5 pixels, edge-distance P95 at most 7 pixels, depth MAE at most 2.5%, and depth-error P95 at most 7%.
- [ ] Achieve mean Delta E 00 at most 4, P90 Delta E 00 at most 8, mean masked SSIM at least 0.95, worst-view SSIM at least 0.92, palette-centroid Delta E at most 3, and palette coverage L1 at most 0.08.
- [x] Keep absolute roughness error at most 0.10 and absolute metalness error at most 0.05.
- [x] Use at most 32 object-specific scalars, a 1 KB recipe, a 4 KB gzip production delta, 320 triangles, one draw call, 24 KB of geometry memory, and 5 ms warm-generation p95.
- [x] Pass normative and cross-browser deterministic checks and the offline Reference Independence audit.
- [x] Extract a shared project-owned geometry helper only if Stone and the completed Stone Path independently need the same operation with the same invariants; record the evidence in the ticket outcome.
- [x] Produce the full Evaluation Harness evidence report and retain no source-resolution-dependent fitting artifact in production.

## Answer

The ticket resolves with a negative visual result rather than a threshold relaxation. A retained deterministic loft recipe reaches the exact compactness ceiling at 32 object-specific scalars and passes every non-visual gate: 571-byte recipe, 1,265-byte gzip production delta, 54 triangles, one draw call, 1,452 bytes of geometry memory, 0.1 ms warm-generation p95, three-engine structural/bounds determinism, and isolated offline rendering.

Its best frozen visual result passes bounds, anchor, mean/worst silhouette IoU, and depth MAE, but fails mean contour distance (2.727 px versus 2.5), contour P95 (14.765 px versus 7), and depth P95 (0.0916 versus 0.07). Appearance remains diagnostic because the geometry gate stops the appearance gate. The evidence is frozen in `gt_designer/single-mesh-evaluation/reports/stone-acceptance-v1.json` and `gt_designer/single-mesh-runtime-audit/reports/stone-nonvisual-v1.json`.

No shared geometry helper was extracted: Stone Path needs an exact shallow footprint extrusion, while Stone needs a seeded irregular volume/loft, and the invariants do not match. No source-resolution-dependent arrays, CSG, SDF, WASM, or general geometry layer were introduced. This is a Stage 1 hypothesis failure that Ticket 10 must preserve; it is not permission to weaken the frozen baseline.
