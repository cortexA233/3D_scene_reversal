# Full Island Reconstruction

Status: ready-for-agent

## Problem Statement

Scene Parity Foundation is complete and certified. The measuring foundation works: the Assembled Authored Scene is observed without mutation, all 993 renderables are classified, 672 authored placements correspond one-to-one with Scene Recipe entities, the candidate is produced entirely through the production Scene Generation Module from 11 files with no reference dependency, generation is byte-identical across repeated runs, and a frozen non-compensating gate stack reports a quantified result.

The island itself is not reconstructed. `scene-parity-foundation-certification-v1` records `foundation=PASS` with `candidate=RED`, and the red is large and specific.

World layout is already exact. Scene Placement Anchor, Target AABB Extent, typed Scene Orientation, neighbourhood distance, zone occupancy, and overview overlap ordering all report zero error across all 672 entities, because the Scene Recipe is measured from the assembled scene and the generator honours it as a hard contract. Nothing in this milestone may regress that.

What is wrong is everything the layout does not determine: the shape of each object, the elevation of the ground, the silhouette of the skyline, the distribution of ground cover, and the entire appearance of the scene. The ranked residuals are terrain elevation 16.26 world units at p95, native appearance mean DeltaE 15.41, object surface distance 11.19 at p95 with a worst entity at 165.67, skyline profile 0.0989 radians at p95, semantic component delta 3.98 with 14 entities missing parts, distributed cover at effectively zero overlap, and a worst per-group fixed-camera silhouette IoU of 0.

Human review of the six-camera comparison agrees with the numbers and adds what they do not yet gate: the candidate has no atmospheric depth, so its horizon is a hard line where the reference fades into haze; its sea is a flat saturated plane rather than a shaded water surface; its vegetation reads as sparse sticks rather than dense canopy; and its distant mountains are blocky where the reference's are layered and soft.

Two Foundation limits are carried into this milestone as real blockers rather than as passed checks. The fixed-camera geometry and native appearance layers have no calibrated thresholds, so they cannot pass and are reported as not evaluated. Native Firefox and Safari GPU scene gates cannot run because neither browser is installed on the normative host.

## Solution

### Milestone outcome

Full Island Reconstruction is complete when the automated Scene Parity Gate Stack is green on all four layers against the frozen baseline, the Production Runtime passes its reference-independence, determinism, performance, and compactness gates, the six fixed cameras show no obvious unexplained residual under Human Parity Review, and every environment gate that cannot run on the available hardware is listed explicitly as a blocker rather than as a pass.

The milestone does not permit reaching green by changing what green means. Thresholds are frozen and may change only through an explicit versioned migration with full reference-only recalibration, recorded in an ADR. If Human Parity Review finds an obvious residual that the automated stack accepted, that is a metric blind spot: it becomes new reference-only calibrated evidence and a versioned gate revision, never a waiver.

### Convergence order

Geometry before appearance, and structure before detail. A better material over the wrong shape is not progress, and the gate stack enforces this by refusing to evaluate native appearance until every geometry layer passes.

Within geometry, the order follows both the frozen priority and the measured residuals:

1. the two uncalibrated gate layers, because a layer with no thresholds can never pass and blocks the whole stack;
2. the Environment Recipe's atmosphere, because fog, sky, tone mapping, and post-processing change every pixel of every camera and currently differ wholesale;
3. terrain elevation and the shore profile, the largest geometry residual;
4. the Ocean Appearance Surface and any inner water;
5. Horizon Group ridge silhouettes;
6. ground surfaces — plazas, decks, paving, path stones — which carry the worst per-group silhouette results;
7. architecture silhouettes;
8. vegetation canopies;
9. Distributed Scene Cover regions and densities;
10. semantic part structure for multi-part objects;
11. Material Families and bounded semantic appearance;
12. Semantic Lights and emissive relationships;
13. dynamic environment and frozen-moment stability;
14. performance, bundle, draw calls, and memory;
15. cross-browser native GPU evidence where the hardware exists;
16. final certification and Human Parity Review.

### What may change

The Scene Recipe's compact semantic controls, the Object Generators' local shape and appearance programs, the Bounded Semantic Terrain Program's fitted controls within its frozen budget, the Environment Recipe's parameters, the Material Families, and the population programs.

Every change is fitted through the Reference-guided Fitting Loop proven in Foundation ticket 11: read the immutable reference, measure with the metric acceptance uses, persist a compact production-safe correction, regenerate through the real production path, and re-measure. A correction that exists only in the evaluation path, or that is achieved by retaining dense reference evidence, is rejected.

### What may not change

World placement. Scene Placement Anchor, Target AABB Extent, and typed Scene Orientation are measured from the assembled scene and are already exact; a generator may not reinterpret them, and the extent remains a hard output target rather than a scale hint.

Scene Semantic IDs, derived seed isolation, the root scene seed, the terrain control budget, the frozen camera set, the Normative Scene Capture, Scene Render Contract v1, the Semantic Sea Level, and the frozen thresholds.

The Production Runtime boundary. No authored mesh, GLB, texture, elevation grid, Ground Truth loader, source-node identifier, dense sample array, pixel table, or reference import may enter production, and no generator may use ambient randomness.

### Representation

Reuse the accepted representations rather than inventing new families: the Bounded Support-plane Polyhedron for rock and ridge masses, footprint extrusion for slabs and paving, the hollow lathe for vessels, Axial Layer Families for layered organic forms, Repeated Organic Forms for grouped creatures, and Bounded Semantic Pattern Programs for appearance.

Where a category is not covered, build a purpose-built generator with compact semantic controls. Permitted: compact footprints, axial profiles, bounded support planes, semantic layer families, repeated organic forms, analytic noise, semantic curves, deterministic population rules, and a small number of meaningful per-entity controls. Prohibited: generic model replicators, source mesh converters, dense point-cloud fits, large per-instance authored transform lists, sampled textures or elevation data disguised as procedural code, and per-vertex or per-pixel replay.

### Object families

The 672 authored placements span 45 semantic kinds. They are reconstructed as families rather than one generator per kind, so a shared architecture program serves the pavilion, booths, and shops while their differences stay compact per-entity controls. The families are architecture, bridge, ground surface, rock, horizon ridge, vegetation, prop, sign, vessel, creature, and light fixture.

Family membership is already recorded in the Scene Recipe's `kind` and `group` fields and in the development-side family table, which throws on an unmapped authored family so new reference content cannot be silently dropped.

### Evidence and reporting

Every ticket runs the existing measurement commands and reports against the frozen baseline. No ticket may introduce a new aggregate score, and every metric keeps its aggregate plus its worst-entity, worst-region, worst-zone, worst-camera, and worst-azimuth results.

A ticket is done when its declared red check is green, the gate stack shows the targeted metric improved, no other gate regressed, and the change is one cohesive commit.

## User Stories

1. As the reconstruction owner, I want the two uncalibrated gate layers calibrated from reference-only controls so that the stack can express a pass at all.
2. As a reviewer, I want the candidate's atmosphere to match the authored one so that a hard horizon and a flat sea stop dominating every appearance measurement.
3. As a terrain author, I want elevation and shore profile fitted within the frozen control budget so that the largest geometry residual falls without the program becoming a disguised elevation grid.
4. As a water author, I want the Ocean Appearance Surface shaded, transparent, and phase-frozen so that the sea reads as water without redefining the Semantic Sea Level.
5. As a horizon author, I want each ridge's silhouette reconstructed so that the skyline stops being a row of rounded masses.
6. As a layout reviewer, I want plazas, decks, paving, and path stones to occupy their authored footprints so that the ground stops being the worst-scoring group.
7. As an architecture author, I want buildings reconstructed as roofed, posted, multi-level forms so that their silhouettes and part counts match.
8. As a vegetation author, I want palms, blossoms, and bamboo to read as canopy rather than sticks so that the island's dominant visual mass is right.
9. As a scatter author, I want cover populations to occupy their measured regions at their measured densities so that ground cover stops being absent.
10. As an evaluator, I want multi-part objects to have their parts so that a bounds-accurate single blob cannot pass.
11. As a material author, I want semantic Material Families and analytic patterns so that appearance approaches the authored richness without loading textures.
12. As a lighting author, I want Semantic Lights and their emissive sources reconstructed so that lantern light is light rather than colour.
13. As an evaluator, I want the declared dynamic moments stable so that animation cannot make a capture unrepeatable.
14. As a production owner, I want generation time, bundle size, draw calls, triangles, and memory inside declared budgets.
15. As a browser compatibility owner, I want native GPU evidence wherever the hardware exists, and an explicit blocker where it does not.
16. As the final reviewer, I want the automated stack green and then a six-camera human review whose findings become evidence rather than waivers.

## Implementation Decisions

- Keep the Scene Recipe the sole production-safe scene-specific artifact and keep world layout out of Object Generators.
- Fit every correction through the proven Reference-guided Fitting Loop and persist it before it can affect a report.
- Prefer one family program with compact per-entity controls over one generator per kind.
- Reuse accepted representations before inventing new ones.
- Calibrate the two missing gate layers from reference-only scene-space damage rendered through the same six frozen cameras, not from image-space approximations, so the thresholds mean the same thing as the geometry layers'.
- Treat the Environment Recipe as geometry-adjacent: it is fixed early because it changes every appearance measurement, but it is never used to compensate for shape.
- Keep the terrain control budget frozen. If the fitted program cannot reach the threshold within it, that is a representation-boundary result to be recorded, not a budget increase.
- Record every ADR-worthy decision, especially any threshold migration and any representation boundary that a family fails to cross.

## Testing Decisions

Each ticket adds a non-interactive check that is red before its implementation and green after, and re-runs the existing measurement commands and gate stack.

Analytical fixtures continue to verify metric behaviour independently of the island. Perturbation controls continue to prove that declared damage fails. The production isolation audit, determinism check, and static audit run in the certification command and must stay green throughout.

No ticket may weaken an existing check to make its own pass, and the Foundation's masking tests remain in place: good appearance cannot compensate for broken geometry, a favourable camera cannot hide an opposing view, and a good aggregate cannot hide a failed entity, zone, or azimuth.

## Out of Scope

- Changing world placement, semantic identity, seed derivation, the frozen camera set, the render contract, or any frozen threshold except through an explicit versioned migration with full reference-only recalibration.
- Reproducing source vertices, triangle topology, UVs, or texture pixels.
- Retaining any authored asset, elevation grid, dense sample array, or reference import in production.
- Gameplay, interaction, collision, LOD, deployment, and any Single Mesh Lab work.

## Further Notes

The Foundation's own history is the best guide to how this milestone goes wrong. Every serious defect it found was a measurement that looked green for the wrong reason: a global silhouette dominated by sky and ocean, a depth metric that discarded the foreground, an isolation audit measuring the project's own page, a fitting loop comparing a recipe against itself, and a calibration rule that demoted every metric it was meant to freeze.

Expect the same shape here. When a number improves sharply, check what it is actually measuring before believing it.
