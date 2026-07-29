# 03 — Stone 24-direction support-polyhedron recovery

Type: task
Status: resolved
Outcome: FAIL
Blocked by: 02

Replace Stone's retained negative loft with its sole second compact representation: a convex intersection of at most 24 fixed canonical support directions inside the unchanged v1 budgets.

Acceptance:

- [x] No arbitrary source face normals, copied hull, sampled cross-sections, or expanded loft rings enter production.
- [x] Total complete-source count is at most 32 Object-specific Scalars.
- [ ] Full v1 geometry and appearance gates pass.
- [x] Recipe, bundle, triangle, draw, memory, and generation ceilings pass.
- [ ] Chrome, Firefox, and Safari visual gates pass.
- [x] Determinism and Reference Independence pass.
- [x] Failure stops all later fitting.

## Answer

The second representation is retained as `bounded-support-polyhedron-v2`: 24
fixed canonical directions, 31/32 complete-source scalars, 80/320 triangles,
one draw, 1,488/24,576 geometry bytes, 1,363/4,096 gzip bytes, and 0.2/5 ms
warm p95. Static dependency, isolated offline, byte determinism,
JavaScriptCore/SpiderMonkey structure and bounds, and every nonvisual budget
pass.

The unchanged `single-mesh-quality-baseline-v1` geometry gate fails in Chrome:
mean/worst silhouette IoU are `0.8931/0.8690` versus `0.92/0.88`, mean/P95
edge distance are `6.87/23.77 px` versus `2.5/7 px`, and mean/P95 normalized
depth error are `0.0290/0.1056` versus `0.025/0.07`. Appearance and native
candidate gates correctly do not run after geometry failure. Evidence is
`gt_designer/single-mesh-evaluation/reports/stone-acceptance-v2.json`.

This is a resolved negative result, not a pass. Per ADR-0016 and ADR-0022 it
is the second failed reasonable Stone representation and activates the frozen
boundary-review stop.
