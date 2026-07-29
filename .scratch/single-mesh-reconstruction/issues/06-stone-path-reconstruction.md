# 06 — Stone Path end-to-end reconstruction

**What to build:** Deliver the first real Procedural Replacement as a complete retained vertical slice. Reconstruct Stone Path with a compact semantic footprint, shallow irregular extrusion, and procedural material, then pass every frozen visual and non-visual gate without introducing a general modeling layer.

**Blocked by:** 04 — Quality Baseline calibration and visual gates; 05 — Non-visual acceptance and Reference Independence gates.

**Status:** resolved

## Comments

Implementation in progress. Fitting begins from development-only topology and silhouette measurements; only a compact semantic footprint, height, material scalars, and seed may cross into the production object module.

- [x] Author a typed Stone Path recipe with separate shape and appearance parameters, a stable semantic ID, and an explicit versioned seed.
- [x] Represent the outline with no more than a small semantic footprint/control set whose size is independent of source vertex or sample resolution.
- [x] Generate a closed shallow extrusion as project-owned `BufferGeometry` in source-scene units and the agreed Reconstruction Frame.
- [x] Reproduce authored appearance procedurally with no authored texture bytes, sampled pixel tables, dense lookup data, or runtime texture dependency.
- [x] Pass per-axis bounding-box relative error of at most 2% and bottom-anchor error of at most 0.02 canonical units.
- [x] Across all twelve views, achieve mean silhouette IoU at least 0.95, worst-view IoU at least 0.92, mean symmetric edge distance at most 1.5 pixels, edge-distance P95 at most 4 pixels, depth MAE at most 1.5%, and depth-error P95 at most 4%.
- [x] Achieve mean Delta E 00 at most 4, P90 Delta E 00 at most 8, mean masked SSIM at least 0.95, worst-view SSIM at least 0.92, palette-centroid Delta E at most 3, and palette coverage L1 at most 0.08.
- [x] Keep absolute roughness error at most 0.10 and absolute metalness error at most 0.05.
- [x] Use at most 48 object-specific scalars, a 1 KB recipe, a 4 KB gzip production delta, 96 triangles, one draw call, 5 KB of geometry memory, and 5 ms warm-generation p95.
- [x] Pass normative and cross-browser deterministic checks and the offline Reference Independence audit.
- [x] Produce the full capture, metric, compactness, performance, determinism, and dependency evidence report through the retained Evaluation Harness.
- [x] Do not add a general geometry layer, CSG, SDF, WASM, or operation-tree abstraction in this first object ticket.

## Answer

Implemented as a retained object vertical slice. The production recipe stores a ten-point footprint, fitted base plane, extrusion vector, three semantic side-crease markers, appearance, stable ID, and seed. The generated mesh is a closed project-owned `BufferGeometry` in authored units and the Reconstruction Frame.

Frozen evidence is in `gt_designer/single-mesh-evaluation/reports/stone-path-acceptance-v1.json` and `gt_designer/single-mesh-runtime-audit/reports/stone-path-nonvisual-v1.json`. `npm run accept:ticket-06` passes all tests, ground-truth freshness, visual gates, deterministic/cross-engine checks, budgets, production graph audit, and isolated offline rendering.
