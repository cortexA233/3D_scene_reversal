# Stage 1.5 evidence summary v1

Certification result: **FAIL**. Stage 2 authorization: **DENIED**.

The historical Stage 1 result remains **2/4 FAIL**. The corrected complete-source
scalar audit and both native-browser qualifier gates pass. Stone's sole second
compact candidate—one 24-direction Bounded Support-plane Polyhedron—passes all
nonvisual budgets and Reference Independence but fails the unchanged
`single-mesh-quality-baseline-v1` geometry gate.

## Stone frozen failures

- `geometry.silhouette.meanIou`: 0.8930835067692503 >= 0.92 — FAIL
- `geometry.silhouette.worstViewIou`: 0.8690109301123639 >= 0.88 — FAIL
- `geometry.silhouette.meanEdgeDistancePixels`: 6.868654358146311 <= 2.5 — FAIL
- `geometry.silhouette.edgeDistanceP95Pixels`: 23.769728648009426 <= 7 — FAIL
- `geometry.depth.mae`: 0.029000923376750257 <= 0.025 — FAIL
- `geometry.depth.p95`: 0.10564533088984719 <= 0.07 — FAIL

Stone uses 31/32 complete-source scalars, 80/320 triangles, one draw call,
1,488/24,576 geometry bytes, a 1,363/4,096-byte gzip delta, and 0.2/5 ms warm
p95. Passing compactness cannot compensate for visual failure.

## Kill-gate outcome

Patterned Appearance v2 calibration, Umbrella v2 fitting, Bamboo Shoot and
Mushroom pre-calibration, Stage 2 fitting, and the six-object exit were not run.
This is the required stop after two failed reasonable Stone representations;
no threshold was changed from candidate evidence and no historical report was
rewritten. A new boundary decision is required before another implementation
cycle.
