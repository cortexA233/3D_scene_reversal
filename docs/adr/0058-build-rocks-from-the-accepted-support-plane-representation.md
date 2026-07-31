---
status: accepted
---

# Build rocks from the accepted support-plane representation

`rocks` was the group in ticket 06 whose error is its own shape — pixel ratio 1.03 with silhouette IoU 0.359, the right amount of pixel in the wrong form — and ADR-0057 made it the most exposed one, because shrinking the plaza to its measured footprint stopped it covering the rocks and their contour p95 nearly doubled to 47.9. Its 8.40-unit mean thickness is comparable to the terrain misfit beneath it, so unlike the paving slabs it was never waiting on ticket 03.

The accepted representation for a stone in this repository is the Bounded Support-plane Polyhedron: twenty-four canonical directions and a support distance along each, proven at object scale under `stone-geometry-baseline-v2`. The scene generator was not using it. `mound` built a ring-and-side lattice whose radius is one minus half a roughness constant plus a random share of it, about a sphere — a jittered sphere stretched onto the Target AABB Extent. A sphere inscribed in a box touches the six face centres and falls short everywhere else.

Measured along those same canonical directions, in a frame normalised so each entity's box spans -1 to 1 per axis, that is exactly what it did:

| | authored | jittered sphere | support polyhedron |
| --- | --- | --- | --- |
| mean support over 24 directions | 0.9412 | 0.8382 | 0.9747 |
| directions where the candidate is inside the reference | — | **23 of 24** | 6 of 24 |
| mean absolute profile error, scale-normalised | — | 0.103 short | **0.0428** |

The authored profile's shape says what a sphere cannot follow: the eight upward-leaning directions reach 0.95 to 1.05 while the horizontal ones reach 0.86 to 0.99. That is a boxy mass filling its upper corners.

What crosses into production is 24 numbers and one spread, for 39 rocks. A support distance per direction per entity would be 936 and a per-entity form list is not a reconstruction; the spread plus each entity's own derived seed is what makes the 39 differ. The spread is one family scalar rather than 24 per-direction variances, because at 96 samples per entity the per-direction spread is mostly measurement noise.

The polyhedron is evaluated radially rather than by hull construction. The boundary of an intersection of half-spaces along a ray is the minimum of `support[i] / (ray · direction[i])` over the directions the ray points into, so evaluating that on a ring-and-side lattice gives the polyhedron's silhouette. This deliberately avoids duplicating the hull construction in `objects/stone-generator.js`, which is hash-frozen under `stone-geometry-baseline-v2` and cannot be edited to add an export without breaking that contract.

The direction set itself is imported, not restated, because two copies of a definition is how the reference and the candidate came to be sampled differently while both formulas read identically (ADR-0055). The cost is declared rather than hidden: `gt_designer/src/reconstruction/objects/stone-generator.js` now appears in `PERMITTED_RUNTIME_PATHS` and in `PRODUCTION_FILES`, the production graph is 12 modules instead of 11, and the bundle is 39,807 B gzip instead of 39,209. The scene runtime is now coupled to a frozen artefact from another milestone, which means a future scene-side need to change the direction set will collide with the Stone baseline. That collision is the point: it forces the conversation rather than allowing a silent second copy.

The rendered result, per group:

| `rocks` | before | after |
| --- | --- | --- |
| silhouette IoU | 0.359 | **0.380** |
| contour distance p95 | 47.93 | **24.06** |
| world normal p95 | 83.34 | **68.74** |
| candidate/reference pixels | 1.03 | 1.26 |

And in the gate stack, where the notable line is the last one:

| | before | after |
| --- | --- | --- |
| group contour distance p95 | 27.70 | **25.50** |
| worst group contour distance | 186.24 | **151.62** |
| group silhouette IoU | 0.4676 | **0.4699** |
| group depth p95 | 20.957 | **20.927** |
| group world normal p95 | 80.41 | **79.21** |

`group world normal p95` was the one metric ADR-0057 regressed, from 79.37 to 80.41. It is now 79.21, below where it started: the plaza's concave plate added side faces and the rock's fuller form removed more normal error than the plate cost.

Two residuals are named rather than smoothed over. The rock now **over**-draws at a pixel ratio of 1.26 and its profile overshoots by 3.6 per cent, because the form is built to reach the measured support distances and then normalised onto its box while the authored profile is a 96-sample underestimate of its own form. Chasing that would be fitting to the sampling bias. And one direction, `[0.23, 0.45, -0.86]`, is 0.188 out — about 2.2 times the authored population's own spread there — which is a real single-direction disagreement and is not what this change was for.
