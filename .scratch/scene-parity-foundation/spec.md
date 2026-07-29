# Scene Parity Foundation

Status: ready-for-agent

## Problem Statement

The full-island experiment must reconstruct the complete `gt_designer` island as closely as possible while generating the delivered scene entirely from code. The Production Runtime must not load an existing mesh, GLB, authored texture, terrain heightfield, Ground Truth loader, or reference implementation. Development tooling may read the complete Authored Reference, including its running scene, source code, meshes, textures, heightfield, materials, and lights, but the reference must remain strictly read-only and every retained production result must remain compact, semantic, deterministic, and resolution-independent.

The current full-island prototype does not provide a trustworthy iteration loop. It uses a development extractor to retain bottom-centres, bounds, PCA-derived yaw values, 48 radial coastline measurements, a small relief set, and semantic groups, but the generator subsequently reinterprets those measurements with empirical shrink factors and unrelated primitive approximations. The prototype also diverges from the reference camera and renderer: the authored overview uses a 58-degree field of view and fog at 650/3500, while the prototype uses a 38-degree field of view and different fog. Structures, palms, blossom trees, terrain, coastline, distant mountains, material diversity, lighting, and atmosphere therefore cannot be diagnosed against one stable contract.

Screenshot resemblance alone cannot establish layout parity. A favorable overview can hide missing entities, incorrect placement, wrong scale, reversed facing, terrain errors, a displaced sea level, or a poor distant horizon behind occlusion, fog, and materials. Conversely, source-triangle identity is neither necessary nor permitted: the reconstruction may use different procedural topology, but it must closely reproduce the reference surfaces, visible structure, semantic identity, world layout, and appearance.

The immediate milestone is Scene Parity Foundation. It must freeze immutable reference observation, define one end-to-end Scene Recipe contract, provide direct scene-to-scene 3D comparison, calibrate non-compensating scene gates from reference-only evidence, and record an honest baseline for the current candidate. The milestone establishes a quantitative feedback loop; it does not claim that the current candidate already matches the island.

## Solution

### Milestone outcome

Scene Parity Foundation delivers a reproducible development and acceptance workflow in which the ready Assembled Authored Scene is observed without mutation, the candidate is freshly produced by the same Scene Generation Module used in production, and both subjects are compared in one shared world frame under frozen cameras, renderer conditions, browser time, and evidence definitions.

The Foundation is complete when it can:

- prove that the reference remained unchanged during observation;
- classify all visible reference content in a Semantic Coverage Manifest;
- derive and validate a production-safe Scene Recipe with stable field semantics;
- generate a candidate with no reference dependency or evaluation-time correction;
- compare semantic layout and complete surfaces directly in 3D;
- quantify terrain, coastline, Semantic Sea Level, Horizon Groups, and the complete Horizon Profile;
- capture aligned semantic, silhouette, linear-depth, world-normal, and native appearance evidence through the fixed Scene Evaluation Camera Set;
- distinguish repeatable reference variation and acceptable mild perturbations from declared structural damage;
- freeze the resulting Scene Quality Baseline before further candidate fitting;
- emit a machine-readable and human-reviewable red baseline for the current prototype or its production-path adapter.

The Foundation is not required to make the current candidate pass final geometry or appearance gates.

### Immutable reference observation

The ready Assembled Authored Scene is the sole authority for final world transforms, visibility, geometry, materials, lights, procedural environment, overrides, and native appearance. Raw GLB, texture, heightfield, wildlife, lighting, and layout files are development evidence only. When an offline asset measurement and the assembled scene disagree, the assembled scene wins and the drift is reported.

An Immutable Reference Capture uses only the reference application's existing public camera controls and a development-side Frozen Observation Clock. It does not patch reference source, mutate the scene graph, replace materials, inject shared lighting, change atmosphere, alter post-processing, or normalize reference geometry. The reference runs in an isolated context, and observation records and compares structural, transform, geometry, material, light, renderer, and time summaries before and after access. Any undeclared reference mutation invalidates the run.

Development tooling may read the reference scene and implementation source directly. It may use that evidence to explain semantics, fit compact parameters, and identify general procedural algorithms. A general algorithm or compact semantic parameter reaches production only by being explicitly promoted into an independently owned production module that passes the production isolation audit. The Production Runtime never imports, parses, or otherwise depends on the reference implementation.

Depth, normal, semantic, surface-distance, and other auxiliary reference geometry evidence comes from a separate Reference Analysis Projection. This projection may be derived by read-only geometry inspection, but it is never presented as an authored native rendering.

### Frozen scene observation contract

The normative Scene Anchor is `[86,26,-24]`. It defines the island datum for coastline and terrain semantics, spatial statistics, the top-down camera, and the 360-degree Horizon Profile. It is distinct from the authored overview camera target.

The Scene Evaluation Camera Set contains:

- the authored overview at position `[390,190,410]`, targeting `[80,26,-20]`, with a 58-degree vertical field of view, near 0.5, and far 30000;
- one top-down layout camera framed only from reference world evidence around the Scene Anchor;
- four opposing oblique cameras framed only from reference world evidence.

The auxiliary camera matrices are derived once from the Assembled Authored Scene, recorded, reviewed, and frozen before candidate fitting. No candidate measurement may influence camera position, target, projection, clipping, or framing.

Every blocking rendered pass uses the Normative Scene Capture: a 1440-by-810 CSS viewport, a 1440-by-810 framebuffer, device scale factor 1, and Three.js r170. The browser environment, OS, GPU/WebGL renderer, acceleration state, color configuration, and exact capture time are recorded. The reference query parameter `dpr=1` is not treated as evidence that the framebuffer is correct; the browser environment must enforce the device scale factor.

Scene Render Contract v1 versions every visible observation condition, including:

- camera projection and matrices;
- antialiasing, output color space, tone mapping, exposure, and shadow behavior;
- global sun, hemispheric light, ambient light, local lights, and emissive sources;
- fog, sky, ocean, clouds, and declared URL options;
- bloom, warm grading, vignette, and the currently disabled film-grain noise;
- the main frozen capture moment and a small declared set of dynamic sample moments.

The replacement independently reproduces these conditions and their visible result with production-safe code. Appearance evaluation never gives reference and candidate shared injected materials or lights.

### Scene Recipe contract

The Scene Recipe is the sole production-safe scene-specific artifact. It is versioned and contains only executable code references, shaders, deterministic seed state, and compact Semantic Measurements whose representation size is independent of source geometry, texture, and evaluation resolution.

The Scene Recipe owns:

- schema, generator, and RNG versions;
- one root `sceneSeed`;
- the Scene Anchor and world constants;
- Environment Recipe parameters;
- Identity-bearing Scene Entities and their stable Scene Semantic IDs;
- generator kinds and compact local Object Recipes;
- Material Family assignments and bounded semantic appearance controls;
- Bounded Semantic Terrain Program controls;
- Semantic Sea Level and Ocean Appearance Surface controls;
- Horizon Groups;
- Distributed Scene Cover populations and regions;
- Semantic Lights and their relationships to emissive entities.

Every Identity-bearing Scene Entity uses the following semantics:

- its Scene Semantic ID is stable across extraction, generation, semantic capture, fitting, and reporting; it is not an array index, generated UUID, source-node ID, or exposed authored name;
- its Scene Placement Anchor is the world-space bottom-center of its complete reference-geometry axis-aligned bounding box;
- its Target AABB Extent is the complete final world-axis-aligned bounding-box size and is a hard generated-output target, not a scale hint;
- its Scene Orientation declares `heading`, `axis`, `radial`, or `surface-aligned` semantics rather than treating PCA as a universal facing direction;
- directed `heading` uses local `+Z` as forward and right-handed rotation around world `+Y`;
- undirected `axis` is equivalent modulo 180 degrees;
- `radial` has no yaw gate;
- `surface-aligned` adds a support-normal relationship without weakening heading or axis semantics.

An Object Generator returns its complete local result in a Reconstruction Frame whose full generated AABB bottom-center is `[0,0,0]`. The Scene Generator places that origin exactly at the Scene Placement Anchor. Hidden scale factors, candidate-specific offsets, post-placement fitting, and empirical reinterpretation of Target AABB Extent are prohibited.

All authoritative scene-entity placements are absolute world-space values. Semantic groups express organization and relationships but carry no hidden transform that changes child world placement. Subparts such as a building roof or tree crown remain inside one local Object Generator unless they have independent scene identity and evaluation requirements.

The Scene Recipe stores one root `sceneSeed` rather than a manually maintained seed per entity. A versioned, stateless derivation combines the root seed, stable semantic identity, and purpose label to produce isolated geometry, material, distribution, and environment seeds. Reordering, insertion, deletion, selective generation, parallel scheduling, or an extra random draw in one generator cannot perturb unrelated entities. Seed derivation uses a specified UTF-8 encoding, fixed integer algorithm, golden vectors across supported engines, and collision detection over every current derived key.

### Semantic coverage and correspondence

Every renderable reference geometry, light, and visible environment layer must appear in the development-only Semantic Coverage Manifest as one of:

- an Identity-bearing Scene Entity;
- Distributed Scene Cover;
- terrain, coastline, ocean, or other environment content;
- a Horizon Group;
- an explicitly justified non-target.

Unclassified visible content is blocking. Coverage is reported by entity count, world surface area, and Normative Scene Capture visibility so large terrain surfaces, large populations of tiny items, or hard-coded source-name filters cannot hide omissions. An exclusion records its reason and visible impact.

Buildings, bridges, plazas, path stones, major rocks, palms, blossom trees, bamboo clumps, recognizable decoration, wildlife anchors, Semantic Lights, and the sixteen known distant mountain groups are treated as identity-bearing unless the coverage analysis demonstrates that a narrower or broader semantic unit is required. Grass blades, pebbles, small ground vegetation, and other genuinely dense elements without meaningful individual identity use Distributed Scene Cover populations. Each population has a stable cover identity and is compared by region occupancy, density, count, scale and orientation distributions, neighborhood statistics, and fixed-camera semantic coverage rather than arbitrary instance pairing.

No source-node identifier enters production. Development mappings may retain source identifiers to keep semantic correspondence stable, but regenerating evidence may not silently renumber Scene Semantic IDs.

### Procedural geography and horizon

Terrain uses a Bounded Semantic Terrain Program rather than a runtime heightfield. It contains a fixed-cap, resolution-independent composition of:

- a closed coastline assembled from semantically located curve controls for bays, capes, inlets, beaches, and meaningful transitions;
- named analytic landforms such as plateau, ridge, hill, channel, dune, and shore shelf;
- compact position, direction, radius, height, and falloff controls;
- versioned deterministic analytic noise.

Development fitting may read the complete reference heightfield and surface. Production may not retain a height grid, regular samples, per-vertex heights, distance field, or source-resolution geometry. Mesh tessellation is a general generator concern independent of Recipe shape semantics. The semantic control budget is declared and frozen from reference complexity and calibration evidence before candidate fitting and may not grow until it becomes a disguised heightfield.

The Semantic Sea Level is the static canonical plane at world `Y = 16` with normal `+Y`. Terrain classification, coastline, flooding depth, vertical layout, and horizon occlusion use this datum. The separately generated Ocean Appearance Surface may have wave displacement, shading, transparency, reflection, and frozen phase, but its animation does not redefine sea level or hide geographic errors. Its extent must cover every frozen camera frustum rather than only the authored overview.

Each distant mountain group is an Identity-bearing Horizon Group with a stable identity, placement, Target AABB Extent, orientation, and bounded multi-form ridge, peak, saddle, and foothill controls. A single enlarged Stone or random cone population is insufficient. Evaluation retains per-group world layout, bounds, depth, visible area, overlap order, and silhouette evidence, then measures the combined 360-degree Horizon Profile from the Scene Anchor. Full invisible backside surface distance may remain diagnostic when horizon, depth, and visible surface evidence are more relevant.

### Materials, lights, and appearance

The replacement uses Material Families with compact semantic variants rather than the prototype's small flat palette or the reference's authored textures. Families preserve visibly meaningful color, roughness, transparency, emission, and motif differences. Analytic wood, stone, foliage, terrain, architectural, and hero-object appearance uses Bounded Semantic Pattern Programs in semantic surface coordinates.

Production forbids authored images, extracted pixels, color lookup tables, sampled grids, base64 images, vectorized bitmaps, and sampled constants disguised as shaders. Renderer-owned shadow maps and post-processing render targets are runtime mechanisms rather than authored scene content. A bounded semantic program may be cached through runtime rasterization only when the source representation remains analytic, fixed-cap, and resolution-independent; direct analytic shaders are preferred.

Global sun, hemispheric and ambient illumination, atmosphere, sky, ocean environment, shadows, and post-processing belong to the Environment Recipe. Each meaningful local light is a Semantic Light with stable identity, world placement, color, intensity, range, shadow behavior, and a declared relationship to its emissive source. Emissive materials and actual lights remain distinct. A weak or repeated light may become diagnostic only after reference-only controlled deletion proves it has no blocking visible contribution.

### Reference-guided reconstruction and production generation

Development may run a Reference-guided Fitting Loop:

1. read the immutable reference scene or source evidence;
2. generate a candidate through the production Scene Generation Module;
3. measure direct 3D and rendered discrepancies;
4. update permitted Scene Recipe parameters or the independent production generator implementation;
5. regenerate through the same production path;
6. evaluate the new result.

The fitting loop may automate parameter search and use dense reference evidence in development. It may not persist source-resolution samples, mutate the reference, or correct only the evaluation presentation. Every correction that affects acceptance is first persisted into the Scene Recipe or production generator, then reproduced from a clean replacement-only generation.

The production Scene Generation Module accepts a Scene Recipe and returns the complete generated scene plus a stable semantic index. It owns world composition, local Object Generator use, terrain, ocean, horizon, environment, populations, and post-generation contract checks. Object Generators own only local shape and appearance. The Object Registry maps generator kinds to generators and does not store island instances.

The Candidate Adapter exposes the actual generated production scene for observation. It does not center, normalize, scale, reframe, fit, relight, or otherwise correct the result. Auxiliary candidate analysis may use separate passes, but the world transforms and content being evaluated remain the production output.

The replacement-only entrypoint imports only the Scene Recipe, Scene Generation Module, Three.js, and approved general Runtime Kernels. It builds and renders offline while reference directories and development tools are unavailable and network access is blocked. Its static audit rejects reference source, loaders, asset paths, source identifiers, dense numeric payloads, authored images, GLB/GLTF, heightfields, evaluation imports, ambient randomness, and other disguised Ground Truth dependencies.

### Module and seam design

The feature uses five high-leverage parts:

1. Reference Access Module — gives development code direct but strictly read-only access to the running reference, source evidence, native capture, and analytical queries; it rejects reference mutation.
2. Scene Reconstruction Module — owns Semantic Coverage, Scene Measurement, reference-guided comparison, fitting, and proposed production-safe Recipe or generator changes.
3. Scene Generation Module — the production deep module that turns one Scene Recipe into the complete generated scene.
4. Scene Acceptance Module — applies frozen baselines to fresh reference and candidate observations and emits reports without changing the Recipe, generators, reference, or candidate.
5. Replacement-only composition root — assembles the production Recipe and Scene Generation Module without adding domain logic.

Authored Reference and candidate observation are two real adapters at one scene-observation seam. The adapters permit the Reconstruction and Acceptance modules to request equivalent facts and captures without coupling production to reference loading. Read-only access is not a restriction on development evidence: Reconstruction and Acceptance may inspect all permitted reference facts. The seam enforces immutability on the reference and prohibits transient candidate correction.

The mutable Reconstruction workflow and frozen Acceptance workflow may share metric implementations internally, but their external behavior remains distinct. Acceptance cannot update a threshold, Recipe, generator, or candidate while it is deciding pass/fail.

### Scene comparison and gate stack

Scene acceptance uses a non-compensating Scene Parity Gate Stack. A diagnostic trend index may summarize iteration, but no weighted overall score decides acceptance.

The structural correspondence gate reports and blocks on:

- missing, extra, duplicate, or silently renumbered Scene Semantic IDs;
- semantic type and generator-kind mismatch;
- entity and population counts where count is semantically meaningful;
- Scene Placement Anchor error;
- Target AABB Extent error;
- Scene Orientation error under its declared equivalence;
- invalid parent, attachment, Material Family, or Semantic Light relationship;
- derived seed instability or collision.

The world-space geometry gate reports and blocks on:

- deterministic bidirectional surface-to-surface distance in world units, including RMSE, p95, maximum error, and over-tolerance area;
- semantic part presence, disconnected structure, meaningful holes, openings, layers, and passages;
- pairwise distance, relative bearing, neighborhood, zone occupancy, and overlap-order errors;
- terrain height and slope error across declared interior, shore, and full extents;
- coastline classification, symmetric contour distance, area, perimeter, inlet, and feature errors;
- Semantic Sea Level height, normal, and frustum coverage;
- per-Horizon-Group placement, bounds, depth, visible surface, and silhouette evidence;
- aggregate and worst-azimuth Horizon Profile error.

Direct surface comparison is topology-independent. Candidate vertices, triangles, UVs, and authoring history need not match the source, but low bounds error cannot compensate for missing visible or semantic structure.

The fixed-camera geometry gate retains per-camera and aggregate evidence for:

- semantic occupancy and ID confusion;
- silhouette and contour distance;
- linear depth and depth tails;
- world normals;
- occlusion and overlap ordering;
- camera-matrix and pass alignment.

The native appearance gate compares Immutable Reference Captures with independently generated replacement captures for:

- lit RGB and perceptual difference;
- Material Family regions and small semantic regions as well as global aggregates;
- dominant and secondary palette;
- roughness, transparency, emission, and procedural-pattern evidence where observable;
- local light contribution, shadow placement, fog layering, sea/sky transition, and atmospheric depth;
- the main authored composition and every auxiliary camera.

Every gate retains aggregate and worst-entity, worst-camera, or worst-azimuth results. Good materials cannot compensate for geometry failure, a large terrain region cannot hide a failed hero object, and a favorable camera cannot hide a bad opposing view.

### Calibration, baselines, and reports

Foundation calibrates the Scene Quality Baseline before using the current candidate for fitting decisions. Calibration uses only repeat Immutable Reference evidence and declared controlled perturbations. The Calibration Bracket includes, at minimum:

- camera matrix, FOV, clipping, aspect, device scale, and capture-time drift;
- semantic deletion, duplication, reassignment, and correspondence swaps;
- per-entity translation, Target AABB Extent, heading, axis, support, and component-deletion ladders;
- terrain elevation, slope, ridge, plateau, channel, inlet, and coast displacement ladders;
- Semantic Sea Level displacement and tilt;
- Horizon Group deletion, depth, extent, peak, saddle, and ordering damage;
- Material Family palette, roughness, transparency, emission, motif, coverage, phase, and scale changes;
- Semantic Light deletion, movement, color, intensity, range, and source-association changes;
- stable repeated captures at the primary and dynamic observation moments.

Declared identity and mild perturbations must pass; declared structural and appearance damage must fail. A metric that cannot separate the bracket is revised or made diagnostic before candidate fitting. Thresholds are never loosened because the current candidate fails.

The Foundation uses one normative browser/GPU environment for blocking calibration and the initial red baseline, with full environment metadata and repeated captures. The interface and report schema remain compatible with native Firefox and Safari evidence, but cross-browser native GPU blocking gates apply later to otherwise-qualified final candidates under ADR-0019.

Scene Acceptance emits a schema-versioned machine-readable report and human-review artifact set containing:

- reference immutability and render-contract verification;
- Semantic Coverage Manifest summary;
- Recipe and generator versions, root and derived seed evidence;
- structural, geometry, camera-pass, and appearance gates;
- aggregate and worst-case entities, cameras, zones, and azimuths;
- overlays, differences, contact sheets, and per-pass diagnostics;
- exact environment and capture metadata;
- clear exit status and failure reasons.

The current candidate is evaluated only after calibration is frozen. Its expected result is an honest red baseline that quantifies the known camera, bounds, terrain, coastline, mountain, material, and lighting gaps and becomes the starting point for subsequent fitting tickets.

Final full-island completion, outside this Foundation milestone, requires both the complete automated Scene Parity Gate Stack and Human Parity Review. Human review cannot waive a failed gate. If a candidate passes automation but remains visibly wrong, the reviewer records the concrete discrepancy and the project adds reference-only calibrated evidence or a versioned gate revision rather than using unexplained subjective rejection or candidate-specific threshold relaxation.

## User Stories

1. As the island reconstruction owner, I want one frozen definition of Scene Parity Foundation so that evaluation infrastructure cannot be confused with a completed visual reconstruction.
2. As the island reconstruction owner, I want the full delivered scene generated from code so that no authored mesh, texture, heightfield, or Ground Truth dependency survives into production.
3. As a reconstruction developer, I want direct read-only access to the complete reference scene so that I can measure actual geometry and layout rather than infer everything from screenshots.
4. As a reconstruction developer, I want to read the reference implementation source during development so that procedural algorithms, transform rules, and lighting intent can guide an accurate independent reconstruction.
5. As a production maintainer, I want promoted algorithms to become independent production-owned code so that removing the reference application does not break the generated island.
6. As an evaluator, I want the assembled running reference to be authoritative so that raw GLB coordinates or offline overrides cannot silently disagree with what users actually see.
7. As an evaluator, I want reference immutability verified before and after each run so that measurement or capture code cannot accidentally move, relight, or rematerial the ground truth.
8. As an evaluator, I want browser time frozen externally so that water, clouds, characters, and post-processing can be captured repeatably without modifying reference code.
9. As a reviewer, I want the authored overview camera reproduced exactly so that final composition is judged against the intended view.
10. As a layout reviewer, I want a fixed top-down and four opposing oblique cameras so that occluded or backside layout errors cannot hide behind the overview.
11. As an evaluator, I want every blocking capture at one fixed viewport, framebuffer, and device scale so that aspect ratio and Retina scaling do not change comparison geometry.
12. As an evaluator, I want the complete renderer, lighting, atmosphere, and post-processing contract versioned so that appearance drift is not mistaken for material or geometry change.
13. As a scene author, I want one stable Scene Anchor so that coastline, terrain, horizon, and spatial statistics share the same world datum.
14. As a scene author, I want every meaningful entity to have a stable Scene Semantic ID so that the same building, tree, rock, light, or mountain remains traceable across extraction and fitting.
15. As a scene author, I want placement to mean the full AABB bottom-center in world space so that generators cannot reinterpret a vague object position.
16. As a scene author, I want Target AABB Extent to be a hard final-world target so that hidden empirical shrink factors fail visibly.
17. As an Object Generator author, I want heading, undirected axis, radial, and surface-aligned orientation semantics so that PCA ambiguity is not presented as a false facing direction.
18. As an Object Generator author, I want to work only in the local Reconstruction Frame so that the Scene Generator remains the sole owner of world layout.
19. As a scene maintainer, I want semantic groups without hidden parent transforms so that scene-tree organization cannot change authoritative placement.
20. As a procedural author, I want to maintain one root scene seed so that the whole island has a manageable deterministic identity.
21. As a procedural author, I want stateless derived random streams so that inserting one object or adding one random draw does not change unrelated entities.
22. As a reviewer, I want all reference content classified so that unrecognized mesh names, lights, or environment layers cannot disappear from the reconstruction plan.
23. As a layout evaluator, I want identity-bearing elements compared one to one so that missing or swapped landmarks are structural failures rather than averaged distance noise.
24. As a procedural scatter author, I want dense cover compared by semantic distributions so that arbitrary pebble IDs are not mistaken for meaningful layout identity.
25. As a terrain author, I want a bounded semantic terrain program fitted against the complete reference surface so that the island can improve beyond radial coast samples without retaining a heightfield.
26. As a coast evaluator, I want world-space coastline and inlet metrics so that a plausible overhead screenshot cannot hide a geographically wrong shore.
27. As an ocean author, I want Semantic Sea Level separated from animated wave appearance so that waves cannot hide an incorrect water datum.
28. As a horizon author, I want all distant mountain groups individually represented and jointly constrained by a 360-degree Horizon Profile so that random cone scenery cannot substitute for the authored skyline.
29. As a material author, I want semantic Material Families and analytic pattern programs so that the reconstruction can approach authored richness without loading source textures.
30. As a lighting author, I want global environment and local Semantic Lights represented separately so that emissive color cannot substitute for missing illumination.
31. As a reconstruction developer, I want an automated reference-guided fitting loop so that direct 3D and rendered errors can update compact production parameters efficiently.
32. As a production reviewer, I want every fitted correction regenerated through the real production path so that evaluation-only transforms or materials cannot create a false pass.
33. As an evaluator, I want topology-independent bidirectional surface distance so that procedural geometry can be directly compared without requiring copied vertices or triangles.
34. As an evaluator, I want semantic openings, layers, parts, and passages checked separately so that similar bounds cannot hide missing meaningful structure.
35. As an evaluator, I want terrain, coast, sea, horizon, layout, camera geometry, and appearance reported separately so that one successful subsystem cannot compensate for another's failure.
36. As an evaluator, I want aggregate and worst-case results so that a large easy region or favorable view cannot hide a failed small entity or opposing view.
37. As a quality owner, I want baselines calibrated from reference repeatability and controlled damage before fitting so that current candidate failures cannot move the acceptance bar.
38. As a developer, I want one structured red baseline for the current prototype so that future tickets can target the largest quantified discrepancy rather than rely on open-ended visual tuning.
39. As a developer, I want machine-readable reports and human-review artifacts produced by the same run so that automated diagnosis and visual judgment refer to identical evidence.
40. As a final reviewer, I want Human Parity Review after every automated gate passes so that metric blind spots are found without permitting subjective waivers.
41. As a browser compatibility owner, I want the Foundation to record normative GPU metadata and preserve cross-browser interfaces so that final Firefox and Safari gates can be added after the candidate qualifies.
42. As a build owner, I want a reference-independent offline entrypoint and static audit so that the generated island remains valid when every authored and development input is unavailable.
43. As an implementation agent, I want each future ticket to expose one runnable red check and fit in a fresh context window so that progress remains narrow, verifiable, and handoff-safe.

## Implementation Decisions

- Treat the current full-island prototype as a negative candidate and measurement-history artifact, not as the architectural shape of the Foundation.
- Use the domain language and decisions in ADR-0036 through ADR-0047 together with the retained object-level ADRs. Where numbering collides during future branch reconciliation, preserve decision contents and renumber before integration rather than overwriting either history.
- Reconcile stable reusable infrastructure from the main line into the experiment branch before Foundation implementation, while leaving the main worktree and unrelated active work untouched.
- Use the five approved high-level parts: Reference Access, Scene Reconstruction, Scene Generation, Scene Acceptance, and the replacement-only composition root.
- Keep Authored Reference and candidate adapters at one real observation seam. Reference access is direct and complete but strictly read-only; candidate access is direct but contains no transient correction.
- Keep the mutable fitting workflow separate from frozen acceptance. They may share internal metric implementations, but only Reconstruction may propose Recipe or generator changes.
- Make the Scene Generation Module the only production owner of world composition. Keep Object Generators local and keep island instances out of the Object Registry.
- Make the Scene Recipe the only production-safe scene-specific artifact and validate it before generation.
- Preserve absolute world placement and prohibit transformed semantic parent groups.
- Replace ambiguous `position`, `size`, and PCA `yaw` interpretations with Scene Placement Anchor, Target AABB Extent, and typed Scene Orientation.
- Use one root scene seed with a versioned stateless derivation keyed by semantic identity and purpose; add golden vectors and collision checks.
- Build the Semantic Coverage Manifest from the Assembled Authored Scene rather than a source-name allowlist.
- Use a Bounded Semantic Terrain Program, Semantic Sea Level, independent Ocean Appearance Surface, identity-bearing Horizon Groups, and a complete Horizon Profile.
- Use Material Families, bounded semantic appearance programs, Environment Recipe parameters, and identity-bearing Semantic Lights.
- Permit development fitting to use dense reference evidence and reference source code while prohibiting those inputs from the retained Recipe and production import graph.
- Use the complete frozen scene observation contract, not the Single Mesh Lab's 38-degree canonical object camera or normalization.
- Use non-compensating structural, world-geometry, fixed-camera-geometry, and native-appearance gates.
- Freeze each baseline from reference-only calibration before inspecting the current candidate for threshold decisions.
- Use one normative browser/GPU environment for Foundation blocking evidence; defer otherwise-qualified native Firefox and Safari scene gates without weakening ADR-0019.
- Emit non-interactive developer commands with failing exit codes and schema-versioned reports for observation verification, coverage, Recipe validation, generation, calibration, evaluation, and production isolation.

## Testing Decisions

Tests exercise the highest approved interfaces and observable behavior. They do not assert private helper structure, intermediate sampling arrays, internal file layout, or implementation-specific scene traversal.

At the Reference Access interface, tests verify that the correct assembled scene becomes ready, the public camera and Frozen Observation Clock produce declared observations, the complete render contract and environment metadata are reported, direct geometry and source evidence are readable, and reference state summaries are unchanged after every allowed operation. A deliberately mutating test adapter must be rejected.

At the Scene Reconstruction interface, tests use small analytical reference fixtures and controlled assembled-scene perturbations to verify complete semantic classification, stable IDs, placement and orientation semantics, bounded Recipe output, and a fitting tracer bullet that persists a correction, regenerates through production, and improves the intended metric without changing the reference or the frozen baseline.

At the Scene Generation interface, tests verify Recipe validation, exact world placement semantics, post-generation anchor and Target AABB checks, typed orientation equivalence, local Object Generator isolation, non-transforming groups, stable semantic indexing, root-seed golden vectors, collision detection, deterministic CPU geometry, and complete environment/geography/horizon composition.

At the Scene Acceptance interface, tests verify that reference and candidate use the same frozen camera matrices, framebuffer, time schedule, pass encodings, and metric definitions; that no candidate normalization or fitting occurs; that structural failures block later success; that aggregate and worst-case evidence are retained; and that a report is reproducible with a stable exit status.

The calibration suite uses identity, repeatability, mild, intermediate, and destructive reference-only controls. It fails if a required metric cannot separate declared mild variation from structural or appearance damage, if a threshold reads candidate results, or if an accepted baseline changes without an explicit version migration.

Geometry metric tests use analytical meshes and fields with known distances, bounds, contours, heights, normals, holes, and horizon angles. Render metric tests use deterministic synthetic masks and buffers with known semantic confusion, silhouette, depth, normal, palette, and perceptual outcomes.

The production boundary test builds and runs the replacement-only entrypoint with reference directories and development tools unavailable, an empty browser profile, blocked external network, and only approved local resources. Static and bundle audits reject model and texture loaders, authored assets, heightfields, reference source, source identifiers, evaluation imports, ambient randomness, dense or suspicious numeric payloads, and unapproved dependencies.

Prior art includes the retained Object Generator contract and versioned RNG, fixed-pass Evaluation Harness, visual metrics, calibration brackets, candidate freezes, semantic pattern metrics, deterministic geometry signatures, static import audit, replacement-only offline browser run, machine-readable reports, and native GPU evidence from the Single Mesh Lab. Their implementation ideas may be reused, but object normalization, the 38-degree twelve-view camera, object thresholds, and object budgets do not transfer to scene evaluation.

Foundation acceptance expects the current candidate baseline to fail visual parity while all infrastructure, immutability, calibration, determinism, and reporting checks pass. A green infrastructure report paired with a red candidate gate stack is a valid and expected milestone result.

## Out of Scope

- Making the current candidate pass final full-scene geometry or appearance parity.
- Completing every building, vegetation, wildlife, prop, material, Semantic Light, cloud, or animation generator.
- Reproducing source vertices, triangle topology, UVs, authoring history, or texture pixels.
- Retaining or loading authored GLB/GLTF, meshes, textures, heightfields, dense surface samples, source code, source-node manifests, or Ground Truth loaders in production.
- An autonomous source-code-to-generator or mesh-to-program synthesis system.
- A general modeling DSL, a universal mesh converter, or an unbounded whole-island optimization run.
- Candidate-specific threshold relaxation, weighted overall acceptance, evaluation-time candidate correction, or candidate-derived camera framing.
- Final cross-browser native GPU scene qualification, final performance and bundle budgets, collision, interaction, LOD, gameplay, or deployment optimization.
- Completing the later geography, semantic layout, object-family, material, lighting, runtime-hardening, and final Human Parity Review milestones.
- Using wayfinder during this milestone.
- Modifying the main worktree or absorbing unrelated uncommitted work from another actor.

## Further Notes

The experiment branch diverged from the common baseline before later Single Mesh Lab infrastructure landed on the main line. The first implementation ticket must re-resolve the then-current main state and import only stable, reusable production and evaluation machinery into the experiment branch without modifying the separate main worktree. Documentation ADR numbers created on this branch have already been placed after the main line's current ADR range to reduce integration conflicts, but the reconciliation ticket must still verify the final sequence.

The existing prototype's known discrepancies, including the camera and fog mismatch, empirical entity shrink factors, terrain error, shore-classification error, primitive mountain substitution, and small mostly flat material set, are diagnostics rather than acceptance thresholds. Foundation first calibrates reference-only thresholds, then records these candidate values under the frozen definitions.

After this specification is decomposed into tickets, each ticket is implemented in a separate fresh session using `/implement`. An overnight goal may wrap one concrete ticket, never the complete island. The full spec, relevant ticket, `CONTEXT.md`, and applicable ADRs are the handoff authority for each implementation session.
