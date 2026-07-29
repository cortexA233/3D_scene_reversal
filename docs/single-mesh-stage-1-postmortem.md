# Single Mesh Lab Stage 1 Postmortem

Status: accepted input to the Stage 1.5 specification cycle
Date: 2026-07-29

## Outcome

Stage 1 remains a frozen negative experiment under `single-mesh-quality-baseline-v1`: Stone Path and Vase passed every declared gate, Stone failed geometry, and Umbrella passed geometry but failed appearance. The strict core-hypothesis result is therefore **2/4 FAIL**. Stage 1.5 may produce new versioned evidence, but it may not rewrite this result as a retroactive four-of-four pass.

| Reconstruction Unit | Frozen result | Geometry | Appearance | Principal evidence |
| --- | --- | --- | --- | --- |
| Stone Path | PASS | PASS | PASS | Accepted shallow footprint extrusion |
| Stone | FAIL | FAIL | Not formally evaluated | Compact loft missed contour and depth tails |
| Vase | PASS | PASS | PASS | Accepted hollow lathe and procedural gradient |
| Umbrella | FAIL | PASS | FAIL | Radial assembly passed; compact flower/leaf appearance failed |

The failure does not authorize weaker Stage 1 v1 thresholds. It does justify a separately pre-calibrated Patterned Appearance Baseline for a new Umbrella candidate and separate category-specific baselines for later object classes.

## Technical failure: Stone

The retained Stone candidate is a three-ring compact loft. Its nine-point footprint is reused homothetically through the height with global scale, translation, planar tilt, and small seeded deformation. It reached the exact 32-scalar ceiling and passed its originally reported nonvisual gates.

Frozen geometry failures:

| Metric | Actual | Required |
| --- | ---: | ---: |
| Mean symmetric contour distance | 2.727 px | <= 2.5 px |
| Contour-distance P95 | 14.765 px | <= 7 px |
| Depth-error P95 | 0.0916 | <= 0.07 |

Mean and worst-view silhouette IoU, bounds, anchor, and depth MAE passed. Diagnostic volume was 42.6% below the Authored Reference despite similar surface area. High-elevation and tail metrics therefore expose missing independent three-dimensional facets rather than a global framing error.

The evidence-backed root-cause hypothesis is representation under-capacity: homothetic rings cannot independently express the reference's side and shoulder support planes. This remains a hypothesis until the second representation is evaluated.

A read-only convexity check supports the selected second route. The reference convex hull exceeds the source by only about 0.0032% in volume and 0.00035% in area, so a compact convex half-space representation is not disqualified by a meaningful source concavity.

Stage 1.5 gives Stone one distinct second candidate: a Bounded Support-plane Polyhedron with at most 24 fixed canonical directions inside the unchanged 32-scalar and other v1 budgets. Adding loft rings, copying arbitrary source face normals, or expanding the support-direction set does not count as another reasonable compact representation. It must pass the complete v1 geometry and appearance gates, not only the three metrics that currently fail.

## Technical failure: Umbrella

Umbrella's recovered radial construction is positive evidence. The replacement reduced 76 exported components to one semantic root, stable semantic parts, and two render batches while passing every frozen geometry gate:

- mean/worst silhouette IoU: `0.988 / 0.966`;
- mean/P95 contour distance: `0.357 / 1 px`;
- depth MAE/P95: `0.00486 / 0.0459`;
- maximum bounds error: `0.42%`;
- bottom-anchor error: effectively zero.

Generated vertex colors and a compact procedural flower/leaf shader were both insufficient. The shader candidate passed mean Delta E but failed five appearance gates:

| Metric | Actual | Required by v1 |
| --- | ---: | ---: |
| P90 Delta E 00 | 59.91 | <= 22 |
| Mean masked SSIM | 0.451 | >= 0.78 |
| Worst-view SSIM | 0.323 | >= 0.68 |
| Palette-centroid Delta E 00 | 19.01 | <= 8 |
| Palette coverage L1 | 0.910 | <= 0.20 |

The evidence-backed conclusion is narrower than “procedural appearance cannot work.” The two tried representations did not express the authored identity within v1. A Bounded Semantic Pattern Program remains untested: analytic motifs, compact vector controls, semantic canopy coordinates, layering, symmetry, repetition, and domain transforms are allowed while pixels, sampled grids, vectorized bitmaps, textures, and resolution-scaled data remain prohibited.

The current Umbrella geometry is frozen for the Stage 1.5 appearance experiment. Redesigning it would confound the variable under test. A native-browser geometry failure, if found, is handled as a separate cross-browser defect.

## Evidence gap: Firefox and Safari GPU output

Stage 1 proved Chrome CPU-byte determinism and JavaScriptCore/SpiderMonkey structure and bounds agreement. JavaScriptCore and SpiderMonkey were engine-shell evidence, not browser GPU evidence. Firefox and Safari native GPU visual-tolerance runs were skipped after normative Chrome object failures made a passing Stage 1 certification impossible.

No cross-browser visual pass is implied. Stage 1.5 requires a Native GPU Visual Gate produced inside hardware-accelerated Firefox and Safari from fresh in-engine Authored Reference and replacement captures. Software renderers, SwiftShader, and engine shells do not satisfy this gate.

## Evidence defect: incomplete scalar audit

The experiment specification states that every object-specific numeric constant counts whether it appears in a recipe, generator, shader, helper call, or embedded table. The retained nonvisual audit instead configured `scalarFiles` to count recipe literals while excluding generator control-flow literals and generated shader source.

Umbrella's reported `86/96` result is therefore incomplete evidence. Its generator contains object-specific hardware dimensions and pattern constants outside the recipe. This finding does not prove that Umbrella or another object exceeds its budget; it proves that the reported scalar pass does not establish compliance with the declared definition.

Stage 1.5 must repair the audit contract and rerun all four Stage 1 objects before assigning Umbrella appearance headroom or accepting any object-specific scalar result. Universal algorithm and control-flow literals may be excluded only through a documented classification; geometry- or appearance-specific choices may not be excluded because of file location.

## Process deviation: strict sequence was not enforced

The accepted Stage 1 specification required each tracer bullet to pass before the next began. Stone resolved with a negative result, but Vase and Umbrella work continued. The extra evidence is valuable and remains valid, but execution drifted from a strict tracer-bullet sequence to batch completion followed by aggregate certification.

The operational ambiguity was that a ticket could be `resolved` with a negative experimental answer and then be treated as if its stage gate were complete. In future stages, **resolved is not synonymous with passed**.

Stage 1.5 and Stage 2 correct this with explicit early kill gates. A required candidate that does not pass blocks later candidate fitting even when its report and implementation work are complete.

## Causes ruled out by current evidence

The following were not causes of the 2/4 visual result:

- combined production payload: 7,714 bytes gzip versus a 40,960-byte Stage 1 limit;
- sequential warm generation: 1.6 ms p95 versus 25 ms;
- runtime textures: zero;
- production WASM: absent;
- isolated offline replacement render: passed;
- Authored Reference independence: passed;
- Chrome deterministic CPU bytes: passed;
- JavaScriptCore/SpiderMonkey semantic structure and canonical bounds: passed;
- missing shared CSG, Boolean, SDF, or geometry-kernel operation: no two-object trigger was observed.

The incomplete scalar audit narrows confidence only in object-specific scalar compliance. It does not invalidate the independently measured bundle, timing, draw-call, geometry-memory, offline, or runtime-texture results.

## Corrective decisions

1. Preserve `single-mesh-quality-baseline-v1` and the historical 2/4 result.
2. Introduce a blocking Stage 1.5 Decision Gate; do not relabel further exploration as Stage 2.
3. Repair and rerun complete-production-source Object-specific Scalar auditing.
4. Require full-protocol native Firefox and Safari GPU evidence.
5. Give Stone one bounded 24-direction support-plane candidate and require a complete v1 pass.
6. Freeze Umbrella geometry and calibrate a separate patterned-appearance v2 before fitting a Bounded Semantic Pattern Program.
7. Permit v2 to be materially looser than v1 only while declared destructive pattern controls still fail; freeze it before candidate fitting.
8. Pre-calibrate and jointly freeze separate Bamboo Shoot and Mushroom baselines before Stage 2.
9. Restore strict sequential gates for Stage 1.5 and Stage 2.
10. Permit a formal Versioned Category Exit after six required objects pass their declared baseline versions, without rewriting Stage 1 history.

The accepted execution and exit decisions are specified in [single-mesh-stage-1-5-stage-2-decisions.md](./single-mesh-stage-1-5-stage-2-decisions.md).
