# 09 — Umbrella end-to-end reconstruction

**What to build:** Reconstruct Umbrella as one stable semantic object root composed from a parameterized canopy, radial repetition, shaft, curved handle, cap, and any evidence-backed structural parts. This slice must prove that an exported single mesh with many disconnected components can become an editable multi-part generator while remaining within rendering budgets.

**Blocked by:** 08 — Vase end-to-end reconstruction.

**Status:** resolved

## Comments

Implementation started after Ticket 08 passed its frozen visual and nonvisual gates. The authored export's 76 connected components will be treated as evidence to recover semantic radial construction, not copied as 76 production parts.

Resolved with a negative appearance result and retained positive geometry/runtime evidence. Component analysis recovered one beveled 24-panel canopy, two radial rib layers, 24 support struts, and a collinear runner/shaft/grip assembly from the 76 disconnected source components. The production generator compiles that construction into one stable semantic root, six stable part IDs, two render batches, and no copied transforms. Geometry passes every frozen hard gate: mean/worst silhouette IoU `0.988 / 0.966`, mean/P95 edge distance `0.358 / 1 px`, depth MAE/P95 `0.00488 / 0.0459`, bounds error `0.42%`, and exact bottom anchoring.

Two compact appearance representations were tested without changing the frozen baseline: generated vertex colors and then a fragment-shader flower/leaf construction driven by seven blossom and eight leaf controls. The shader version retains no pixels and passes mean Delta E (`9.99 <= 10`), but fails P90 Delta E (`59.91 > 22`), mean/worst SSIM (`0.451 / 0.323` vs `0.78 / 0.68`), palette-centroid Delta E (`19.01 > 8`), and palette coverage (`0.910 > 0.20`). More literal reproduction would require evidence for a richer procedural appearance representation or mesh/image-like retained data; the latter is prohibited. This is a Stage 1 hypothesis failure, not a reason to weaken the gate. Nonvisual evidence passes with 86 scalars, a 1,061-byte recipe, 3,219-byte gzip object delta, 5,336 triangles, two draw calls, 221,544 geometry bytes, 1.5 ms warm-generation p95, zero runtime textures, and no WASM. Reports: `gt_designer/single-mesh-evaluation/reports/umbrella-acceptance-v1.json` and `gt_designer/single-mesh-runtime-audit/reports/umbrella-nonvisual-v1.json`.

The source evidence did not contain a curved hook handle: its shaft, runner, and terminal grip are collinear with the canopy axis. The generator preserves that measured construction rather than inventing a curve from the ticket's initial description.

- [x] Author a typed Umbrella recipe with separate shape and appearance parameters, a stable root ID, stable IDs for meaningful parts, and an explicit versioned seed.
- [x] Generate a parameterized canopy and evidence-backed radial panels or ribs from compact counts and profile controls rather than copied component transforms or sampled vertices.
- [ ] Generate the shaft, curved handle, cap, and other silhouette-critical parts in source-scene units and the agreed Reconstruction Frame.
- [x] Preserve meaningful construction hierarchy and merge compatible geometry during initialization only when required to satisfy the draw-call budget.
- [ ] Reproduce the authored textured identity procedurally without authored pixels, sampled lookup data, or runtime texture bytes.
- [x] Pass per-axis bounding-box relative error of at most 2% and bottom-anchor error of at most 0.02 canonical units.
- [x] Across all twelve views, achieve mean silhouette IoU at least 0.90, worst-view IoU at least 0.84, mean symmetric edge distance at most 2.5 pixels, edge-distance P95 at most 8 pixels, depth MAE at most 3%, and depth-error P95 at most 8%.
- [ ] Achieve mean Delta E 00 at most 10, P90 Delta E 00 at most 22, mean masked SSIM at least 0.78, worst-view SSIM at least 0.68, palette-centroid Delta E at most 8, and palette coverage L1 at most 0.20.
- [x] Keep absolute roughness error at most 0.10 and absolute metalness error at most 0.05.
- [x] Use at most 96 object-specific scalars, a 2 KB recipe, a 10 KB gzip production delta, 5,760 triangles, two draw calls, 256 KB of geometry memory, and 12 ms warm-generation p95.
- [x] Pass normative and cross-browser deterministic checks and the offline Reference Independence audit.
- [x] Produce the full Evaluation Harness evidence report and show that source export component count does not dictate the replacement hierarchy.
- [x] Record any repeated geometry operation shared across completed generators, but do not adopt Manifold, WASM, CSG, SDF, or a general modeling DSL without the accepted multi-object evidence trigger.
