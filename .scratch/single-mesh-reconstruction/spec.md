# Single Mesh Reconstruction Experiment

Status: ready-for-agent

## Problem Statement

The project must ultimately reconstruct the complete authored island village as a fixed-seed, Exact-ish Reconstruction whose scene-specific content is compact, semantic, editable TypeScript/JavaScript and shaders. The Production Runtime must not depend on the Authored Reference, authored textures, heightfields, model CDNs, or large arrays that merely serialize source geometry or appearance under a different name.

The existing Single Mesh Lab is useful ground-truth presentation infrastructure, but it does not yet answer the reconstruction question. It loads the authored village through GLTF and Draco loaders, bakes each selected mesh's world-space geometry into a bottom-center display object, normalizes the largest dimension to seven units, and presents an interactive reference gallery. It has no Procedural Replacements, fixed evaluation capture, quantitative difference passes, replacement-only entrypoint, dependency audit, or automated quality and performance gates.

The eight selected references also show why “single mesh” cannot be treated as “simple object.” Some exported meshes contain multiple disconnected or open components, repeated forms, or appearance information carried by authored textures. A valid Procedural Replacement therefore cannot be required to reproduce the source topology or to contain exactly one render mesh. It must reproduce one semantic object under measurable constraints.

The experiment must determine whether a human-guided, measurement-assisted Scene Decompiler Workflow can compress representative authored objects into compact, explainable, editable, deterministic, Reference-Independent Object Generators. It must distinguish this central hypothesis from the much larger problems of autonomous program synthesis and full-island reconstruction.

## Solution

### A. Full-island target contract

#### Mandatory outcome

The complete authored island village is the mandatory North Star. A later production implementation must reconstruct the full scene with a fixed seed and meet declared object-level and scene-level Exact-ish Reconstruction gates. The Single Mesh Lab is phase-one evidence for that outcome, not a substitute for it and not an optional side project.

Exact-ish Reconstruction means observational equivalence to the Authored Reference within frozen tolerances over fixed RGB, silhouette, linear-depth, world-normal, semantic, and diagnostic passes. It does not require identical vertices, indices, UVs, topology, export batching, or authoring history. Visual quality alone is insufficient: a result must also meet compactness, editability, determinism, runtime, and Reference Independence gates.

#### Code-only Production Runtime boundary

The scene-specific production payload may contain only TypeScript/JavaScript, shaders, explicit versioned seeds, and compact Semantic Measurements. Parameter size must be independent of source vertex count, triangle count, texture resolution, and analysis sample resolution.

The delivered runtime must:

- run with the network blocked and an empty browser cache;
- continue to build and run after Authored References and authoring-only tools have been removed;
- contain no authored GLB, GLTF, texture, heightfield, model CDN, source-node manifest, dense cross-section set, sampled lookup image, base64 asset, or large vertex/index/sample array;
- keep geometry generation, appearance generation, and scene placement as separate responsibilities;
- preserve stable semantic IDs and deterministic structural decisions;
- generate or initialize third-party geometry as `THREE.BufferGeometry` before it enters the render scene;
- preserve original scene units and a recoverable local coordinate frame rather than depending on the Lab's normalized display coordinates;
- allow generated geometry and materials to be shared by repeated instances;
- remain compatible with future layout, instancing, semantic passes, collision, LOD, interaction, and animation work without placing those speculative fields in the first interface.

Ordinary npm JavaScript geometry libraries are permitted only as general-purpose Runtime Kernels. Each production dependency must have an acceptable and recorded license, a locked version, local/offline bundling, deterministic behavior, no object-specific authored data, and acceptable incremental bundle, initialization, and generation cost. “No GLB” alone does not satisfy the Code-only Production Runtime boundary.

WASM is excluded from the first reconstruction tranche and remains excluded by default from the full island. A WASM Runtime Kernel may be reconsidered only if at least two reusable shape classes independently demonstrate a material need that small Three.js-based generators cannot satisfy within the quality and compactness budgets. Any exception must preserve recipes and semantic decisions in TypeScript, contain no object-specific data, run locally and offline, pass separately declared bundle/initialization/generation budgets, convert results to `THREE.BufferGeometry`, and release temporary kernel objects. Manifold is a development/reference candidate, not an approved production dependency.

Python, Blender, C++, WASM, OpenSCAD-like tools, SDF systems, and other external geometry software may be used during development for inspection, measurement, comparison, or bounded experiments. Their generated meshes, dense samples, runtimes, and authored artifacts do not cross into production unless a later ADR explicitly changes the boundary.

#### Required long-term capability

The full island must eventually cover terrain, coast, waterline, paths, roads, bridges, structures such as the Shop, pavilion, gate, and railing, vegetation and scatter systems such as trees, bamboo, rocks, and grass, procedural sky, water, fog, and wind, plus hero props, wildlife, animation, interaction, and collision. It must have explicit scene-level budgets for frame time, draw calls, triangles, memory, initialization, and delivered size.

Single Mesh Lab is responsible for validating the reusable object-level foundation: Reconstruction Frames, deterministic recipes, purpose-built Object Generators, stable semantic roots, compact Semantic Measurements, reference-framed quality evaluation, dependency isolation, and performance accounting. It is not responsible for proving terrain, layout, scatter, animation, or full-scene performance.

#### Deliberately deferred full-island decisions

This specification does not choose a final scene DSL, terrain or path representation, structure grammar, scatter/layout architecture, collider schema, LOD schema, socket or animation interface, renderer migration, WebGPU/TSL strategy, complete-scene numeric budgets, or a production WASM exception. Those decisions require evidence from the object experiment or later domain-specific experiments.

### B. Single-mesh experiment specification

#### Core hypothesis and secondary questions

The core hypothesis is:

> A human-guided, measurement-assisted Scene Decompiler Workflow can turn representative Authored References into compact, explainable, editable, deterministic, Reference-Independent JavaScript/TypeScript Procedural Replacements that satisfy frozen multi-view quality and runtime gates.

The experiment validates whether the workflow can recover and encode generator-relevant structure such as profiles, footprints, primitives, repetition, deformation, and component hierarchy. It also tests whether the retained recipes and generators are credible foundations for full-island objects.

Secondary questions are which representation best fits each shape class, when a shared helper has earned its abstraction, and when an external Runtime Kernel deserves reevaluation. Autonomous mesh-to-program synthesis, universal operation-tree recovery, and a general modeling language are not success criteria.

#### Test seams

The experiment uses three principal seams:

1. The Object Generator contract: a typed semantic recipe plus an explicit versioned seed produces one stable semantic `THREE.Object3D` root in its Reconstruction Frame.
2. The Evaluation Harness contract: an Authored Reference and its Procedural Replacement enter the same reference-derived frame, view set, renderer, and pass pipeline; the harness emits captures, metrics, performance evidence, and a machine-readable acceptance report.
3. The production-system boundary: the complete replacement set builds and runs locally with no reference loader, authored asset, source manifest, CDN, or network access.

Generator unit tests and metric-function tests support these seams, but acceptance is decided by the black-box Evaluation Harness and production-system boundary rather than by private implementation details.

#### Stages and object order

Stage 0 establishes the Quality Baseline before fitting any replacement. It delivers the Ground Truth Extractor, Evaluation Harness, twelve-view multi-pass capture, comparison modes, machine-readable reports, sensitivity calibration, deterministic/performance measurement, static dependency audit, and replacement-only entrypoint.

Stage 1 is a strict tracer-bullet sequence:

1. Stone Path — the first complete vertical slice; validates compact footprint recovery, irregular shallow extrusion, end-to-end evaluation, and Reference Independence.
2. Stone — validates a low-poly closed volume, fixed-seed deformation, and a looser organic silhouette class.
3. Vase — validates a compact axial profile, lathe/revolve construction, and texture-independent procedural appearance.
4. Umbrella — validates a semantic object made from many radial and hierarchical components, repeated structure, a curved handle, and draw-call consolidation.

Each object must pass before work begins on the next. No generalized geometry abstraction may be introduced before the Stone Path vertical slice is complete.

Stage 2 tests whether the approach survives harder topology and repetition cases:

5. Bamboo Shoot — validates tapered axial layering and open or separated surface components.
6. Mushroom — validates a repeated multi-organic form composed from stems and radial caps.

Blue Hat and Candle are deferred from this experiment's formal exit. They remain mandatory for eventual full-island reconstruction. Candle must later be treated as a candle-plus-carved-pedestal compound object rather than assumed to be a simple cylinder and flame.

Four of four Stage 1 objects are required to support the core hypothesis. Six of eight references, including Bamboo Shoot and Mushroom, are required for formal Single Mesh Lab exit.

#### Object representations

Stone Path uses a compact two-dimensional footprint or small set of semantic boundary controls, a shallow extrusion, and only evidence-backed irregularity. The output is purpose-built `BufferGeometry`; it must not retain a sampled copy of the source boundary.

Stone uses a compact low-poly polyhedral base with explicit, versioned seeded deformation. Randomness may affect generator parameters or vertex positions deterministically, but may not change IDs or depend on call order outside the generator.

Vase uses a compact axial profile and `LatheGeometry` or an equivalently small revolve implementation. Any asymmetry or surface irregularity is added only when the geometry or appearance gates show it is required.

Umbrella uses a parameterized canopy, radial ribs or panels, shaft, handle, and cap. These may remain meaningful child parts during construction and may be merged at initialization when needed to meet the two-draw-call limit. The source mesh's disconnected-component count does not define the replacement hierarchy.

Bamboo Shoot is expected to use axial layers, taper, and explicit open-surface elements. Mushroom is expected to use a small repeated composition of stem and radial-cap generators. These are starting hypotheses, not frozen facts; their final representations must follow Stage 2 evidence.

The default implementation route is direct Three.js plus small project-owned Object Generators. A shared internal geometry helper is introduced only after the same operation is needed by at least two generators. A small high-level operation tree is reconsidered only after at least three shape classes repeat the same composition pattern. Robust CSG or Manifold is reconsidered only when at least two classes independently require boolean behavior that direct generation cannot meet within budgets. SDF or implicit modeling is reconsidered only when a required organic class cannot pass the frozen gates with compact direct geometry. OpenSCAD, libfive, Sverchok, Geometry Nodes/geonodes, and fogleman/sdf are architecture references or development-only tools, not production dependencies in this experiment.

#### Dependency and modeling-route decision

The following is an experiment decision matrix, not a repository popularity ranking. Package facts are the research snapshot used for this specification and must be rechecked before any later adoption.

| Route or candidate | Current object-level value | Runtime, license, and browser cost | Decision for this experiment | Evidence that triggers reevaluation |
| --- | --- | --- | --- | --- |
| Three.js built-ins plus project-owned `BufferGeometry` | Directly covers extrusion, low-poly deformation, lathe, radial repetition, and component composition needed by Stage 1 | Existing JavaScript/browser stack; Three.js is MIT-licensed and already present; no new runtime or initialization boundary | Selected production route | Reevaluate individual operations only after a required object fails two reasonable compact direct representations |
| Small internal parameterized geometry layer | Could share profile, ring, extrusion, or radial helpers without adding a third-party runtime | Project-owned TypeScript/JavaScript; bundle and maintenance cost grow with each abstraction | Add one helper only after at least two generators need the same operation | Two completed generators duplicate the same operation with the same invariants |
| Self-implemented OpenSCAD-like operation expression | Could make repeated composition readable if the project discovers a stable vocabulary | Project-owned runtime avoids OpenSCAD's desktop C++/GPL-2.0 dependency, but introduces evaluator, typing, validation, and debugging cost | Do not build in Stage 1 | At least three shape classes repeat the same operation composition and plain typed recipes have become harder to understand |
| Manifold / `manifold-3d` | Provides robust mesh booleans and manifold operations if compound structures genuinely need them | JavaScript API over Apache-2.0 WASM; the researched 3.5.1 package includes roughly 541 KB of WASM plus a 75 KB JavaScript loader, with asynchronous initialization, WASM lifecycle/disposal, conversion, and generation cost | Development/reference use only; no Stage 1 production dependency | At least two reusable classes need robust booleans, direct attempts fail budgets, and a measured spike passes license, local bundle, initialization, generation, determinism, disposal, and `BufferGeometry` conversion gates |
| OpenSCAD | Useful reference for readable constructive-solid operation semantics | C++ desktop application under GPL-2.0; not a direct browser runtime and would introduce an unsuitable production toolchain boundary | Architecture reference only | No direct adoption trigger; any useful expression concept must be justified and implemented within the evidence rule above |
| libfive | Useful reference for functional representations, interval evaluation, and implicit modeling | C++ f-rep system; core is MPL-2.0; no justified direct browser integration in the current stack | Architecture or bounded offline experiment only | A required organic class defeats compact direct geometry and an implicit spike demonstrates lower total production cost than direct or SDF alternatives |
| Sverchok | Useful reference for procedural node vocabulary and data flow | GPL-3.0 Blender add-on using Blender/Python; browser bundle and initialization are inapplicable because it remains an authoring environment | Architecture/offline reference only | No production trigger in this experiment; repeated workflow evidence may inspire project-owned concepts without copying incompatible code |
| Geometry Nodes / geonodes | Useful reference for field-based procedural composition and geometry-node ergonomics | Blender runtime with Python-facing tooling; the researched geonodes repository did not provide a dependable production license declaration, so code reuse is not assumed | Architecture reference only | A later scene-domain experiment may reuse concepts after independent design and fresh license review |
| fogleman/sdf | Useful for quickly testing signed-distance descriptions of organic shapes | MIT-licensed Python using NumPy/SciPy/scikit-image and sampling-based meshing; unsuitable as a browser production dependency and prone to resolution-scaled data/work | Development-only geometry experiment | Direct geometry fails an organic class and an SDF prototype proves a compact analytic recipe can be implemented within the approved production boundary |
| Python, Blender, or C++ measurement tools | Can decode, section, fit, render, and inspect Authored References during development | Offline authoring dependencies; their runtime, meshes, samples, and cache products are prohibited from production | Allowed only behind the ground-truth/evaluation boundary | They may be replaced for workflow efficiency, but their use never by itself justifies a production dependency |

Any future third-party choice must report the dependency's complete transitive runtime, exact license, compressed and installed size, local/offline packaging, initialization latency, geometry-generation latency, deterministic behavior, memory/lifecycle rules, output conversion, and whether it contains or encourages scene-specific sampled data. Passing the Code-only Production Runtime boundary is necessary but not sufficient; it must also beat a smaller project-owned solution on measured total cost.

#### Minimal Object Generator contract

Each typed recipe contains a stable semantic ID, generator kind, explicit seed, typed shape parameters, and separate typed appearance parameters. The Object Generator receives an explicit versioned integer random source and returns one generated `THREE.Object3D` semantic root.

The returned root:

- is expressed in source-scene units, not the Lab's seven-unit display scale;
- uses the Reconstruction Frame, with source-world axis orientation preserved and the source world-space bounding-box bottom-center translated to the local origin;
- contains stable semantic IDs for the root and any meaningful generated parts;
- may contain multiple meshes or construction parts even though the Authored Reference is one exported mesh;
- does not include Lab slot placement, camera, lighting, display normalization, Authored Reference metadata, or evaluation-only state.

The Evaluation Harness derives bounds, triangle count, draw calls, geometry memory, and generation timing from the generated root. Collider, LOD, tags, sockets, animation, scatter, caching policy, declared bounds, layout placement, and source metadata are deliberately absent until object-level evidence requires them.

The selected GLB nodes have placement baked into their geometry and do not expose a trustworthy authored local TRS. The experiment therefore makes no claim to recover an invisible authoring-tool pivot. For full-scene placement, the extracted world-space bottom-center can later restore these references with identity rotation and scale. A future repeated-instance study may infer a more semantic frame, but must not silently rewrite this contract.

#### Ground-truth extraction and retained measurements

The Ground Truth Extractor automatically records development evidence common to all objects:

- source transform and whether transforms appear baked;
- world-space and Reconstruction-Frame bounds, bottom-center, and original scene scale;
- source and welded vertex counts and triangle count;
- connected components, boundary edges, and non-manifold edges;
- surface area and, only for closed valid meshes, volume;
- material base color, roughness, metalness, and authored texture presence, dimensions, and encoded bytes;
- the mapping from a selected source node to its Reconstruction Unit.

Object-specific profile, primitive, cross-section, symmetry, repetition, and operation inference remains human-guided or one-off. Automatic inference is not required before there is evidence that repeated manual work is a bottleneck.

Production may retain dimensions, a small number of semantic footprint/profile/cross-section controls, symmetry and repeat counts, deformation controls, semantic anchors, palette colors, PBR scalars, and other compact fitted parameters. Original world placement belongs to future layout data rather than the Object Generator recipe.

Decoded positions, indices, normals, UVs, dense cross-sections, point clouds, sample grids, authored texture pixels, lookup images, render passes, fitting histories, source node names, Lab slots, and display scales remain development-only. Any retained runtime parameter set whose size grows with the source mesh, texture, or analysis resolution is serialized Authored Reference data and fails the Code-only Production Runtime boundary.

#### Reference/replacement comparison

Every capture is 512 by 512 pixels with a perspective camera at 38-degree vertical field of view. The Evaluation View Set contains twelve cameras:

- eight cameras at 20-degree elevation with azimuths 0, 45, 90, 135, 180, 225, 270, and 315 degrees;
- four cameras at 60-degree elevation with azimuths 45, 135, 225, and 315 degrees.

The Authored Reference alone defines the comparison transform and framing. Its Reconstruction Frame is normalized so its largest bounding-box dimension is seven canonical units. The camera targets the center of its canonical bounding box. Camera distance is derived from the reference bounding sphere so the sphere fits the square frame with a ten-percent margin; near and far planes are derived from that same sphere. The identical transform, target, camera matrices, clipping planes, renderer, resolution, tone mapping, lighting, and pass definitions are then reused for the Procedural Replacement. The replacement is never independently centered, scaled, or reframed.

The Evaluation Harness provides reference, replacement, overlay, difference, and individual-pass preview modes. It captures:

- neutral-material RGB for geometry diagnosis;
- binary silhouette;
- linear depth;
- world normal;
- semantic/object ID;
- unlit albedo;
- frozen-lighting RGB.

Metrics are reported per view, as a view-set mean, and as a worst-view value. Missing and extra pixels are penalized by silhouette metrics; depth and appearance errors are evaluated on the appropriate shared visible region and may never hide silhouette failure.

#### Stage 0 Quality Baseline calibration

Before Stone Path fitting begins, the reference capture must be repeated to establish renderer repeatability and then subjected to controlled perturbations:

- uniform scale changes of plus or minus 1%, 2%, and 5%;
- canonical pivot offsets of 0.01, 0.05, and 0.10 units;
- rotations of 1, 3, and 5 degrees;
- deletion of a meaningful component where the object contains one;
- reduced profile or radial resolution where applicable;
- known controlled color differences.

The initial metric implementation or threshold values may be corrected once when this calibration reveals a mathematical defect, an unstable pass, or a threshold that does not order the controlled perturbations sensibly. The resulting Quality Baseline is versioned and frozen before replacement fitting. It may not be relaxed because a replacement fails.

#### Geometry gates

All Stage 1 objects must have per-axis bounding-box relative error no greater than 2% and bottom-anchor error no greater than 0.02 canonical units. A degenerate source dimension uses an absolute canonical-unit comparison rather than division by a near-zero value.

Silhouette IoU is computed over the full image. Symmetric edge distance measures both reference-to-replacement and replacement-to-reference contours in pixels. Linear-depth error is measured on the silhouette intersection and normalized by the seven-unit canonical maximum dimension.

| Object | Mean silhouette IoU | Worst-view IoU | Mean symmetric edge distance | Edge-distance P95 | Depth MAE | Depth-error P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Stone Path | >= 0.95 | >= 0.92 | <= 1.5 px | <= 4 px | <= 1.5% | <= 4% |
| Stone | >= 0.92 | >= 0.88 | <= 2.5 px | <= 7 px | <= 2.5% | <= 7% |
| Vase | >= 0.95 | >= 0.92 | <= 1.5 px | <= 4 px | <= 1.5% | <= 4% |
| Umbrella | >= 0.90 | >= 0.84 | <= 2.5 px | <= 8 px | <= 3% | <= 8% |

World-normal angular error, surface area, valid volume, and geometric Hausdorff or Chamfer distance are diagnostic in Stage 1. They must appear in the report when the required source data is valid, but they do not compensate for or veto the hard gates until calibration supplies trustworthy thresholds.

#### Appearance gates

Appearance is evaluated only after geometry passes. Color error is computed both on the unlit albedo pass and the frozen-lighting RGB pass within the reference/replacement silhouette intersection eroded by two pixels. CIEDE2000 uses D65 CIE Lab values derived from consistently encoded comparison pixels. Masked SSIM uses the same region. Palette comparison uses no more than five dominant colors for textured references. Roughness and metalness compare generator material parameters with extracted reference PBR values.

| Object class | Mean Delta E 00 | P90 Delta E 00 | Mean masked SSIM | Worst-view SSIM | Palette-centroid Delta E | Palette coverage L1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Stone Path | <= 4 | <= 8 | >= 0.95 | >= 0.92 | <= 3 | <= 0.08 |
| Stone | <= 4 | <= 8 | >= 0.95 | >= 0.92 | <= 3 | <= 0.08 |
| Vase | <= 8 | <= 18 | >= 0.82 | >= 0.75 | <= 6 | <= 0.15 |
| Umbrella | <= 10 | <= 22 | >= 0.78 | >= 0.68 | <= 8 | <= 0.20 |

Absolute roughness error must be at most 0.10 and absolute metalness error at most 0.05. LPIPS-like perceptual evidence, high-frequency residuals, UV correspondence, and highlight-pixel error are diagnostic only. Authored texture identity must be reproduced procedurally; authored texture bytes, sampled pixel tables, and lookup textures are forbidden.

#### Compactness and runtime gates

Every object-specific numeric constant counts toward its scalar budget whether it appears in a recipe, generator, shader, helper call, or embedded table. Recipe size is canonical minified UTF-8 JSON before compression. Object production bytes are the minified, source-map-free, gzip-compressed incremental bundle delta added by that object's recipe and generator relative to the shared production framework. Geometry memory is the sum of generated index and vertex-attribute typed-array byte lengths. Draw calls are measured with one isolated visible instance.

Warm generation timing covers construction of the semantic root, geometry attributes, normals, and bounds, but excludes module download, shader compilation, and GPU upload. It is measured after ten warm-up generations over at least one hundred disposed repetitions; the reported value is p95. The normative machine is an Apple M5 MacBook Pro with 10 CPU cores, 10 GPU cores, and 32 GB memory, running macOS 26.2, Chrome 150.0.7871.184, and Three.js 0.170.0. A benchmark report records exact OS, browser, Three.js, power state, and hardware metadata so a future baseline migration is explicit.

| Object | Object-specific scalars | Recipe bytes | Production gzip delta | Replacement triangles | Draw calls | Geometry memory | Warm generation p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Stone Path | <= 48 | <= 1 KB | <= 4 KB | <= 96 | 1 | <= 5 KB | <= 5 ms |
| Stone | <= 32 | <= 1 KB | <= 4 KB | <= 320 | 1 | <= 24 KB | <= 5 ms |
| Vase | <= 48 | <= 1 KB | <= 5 KB | <= 1,100 | 1 | <= 40 KB | <= 5 ms |
| Umbrella | <= 96 | <= 2 KB | <= 10 KB | <= 5,760 | <= 2 | <= 256 KB | <= 12 ms |

The complete Stage 1 replacement production bundle, excluding the separately reported Three.js dependency, must be no more than 40 KB gzip. Sequential warm generation of all four Stage 1 objects must be no more than 25 ms on the normative machine. Stage 1 permits no production WASM and no runtime texture bytes. CPU transient heap and shader compilation time are reported diagnostically until measurement stability justifies a hard threshold.

#### Determinism gates

On the normative Three.js and browser versions, repeated generation from the same recipe and seed must produce identical semantic hierarchy IDs, attribute and index lengths, CPU typed-array bytes, material parameters, bounds, triangle counts, and draw calls. Generation must not call ambient `Math.random()`.

Across current project-supported Chrome, Firefox, and Safari builds, the same recipe and seed must preserve semantic hierarchy, topology, branches, counts, and IDs. Bounds may vary by no more than one millionth of the canonical maximum dimension. Byte-identical floating-point arrays are not required across browser engines, and GPU RGB output is judged by the frozen appearance tolerances.

Shader noise may contribute bounded appearance or non-structural micro-deformation, but it may not determine topology, semantic IDs, object count, layout, collision structure, or animation branches.

#### Reference Independence gate

A separate production-style replacement entrypoint imports no GLTF, Draco, texture, or ground-truth loader. It references no authored asset path, source manifest, source-node ID, capture, or analysis artifact. Three.js and every approved dependency are bundled or vendored locally.

Acceptance builds the replacement set after making Authored Reference directories unavailable, starts it with network access blocked and an empty cache, and verifies complete generation and rendering. A static audit rejects GLB/GLTF and authored image references, model-CDN URLs, source manifests, base64 payloads, oversized typed arrays, and suspicious sampled numeric constants. The evaluation entrypoint may import the production generators and load ground truth; the production import graph may never point back to evaluation or ground-truth code.

#### Tool and product boundary

The experiment is a retained vertical slice with disposable analysis edges.

Retained production code consists of typed recipes, Object Generators, the versioned RNG, evidence-backed shared geometry/material helpers, stable semantic IDs, and the replacement-only entrypoint.

Retained development and test infrastructure consists of the Evaluation Harness, fixed view/pass protocol, Ground Truth Extractor, machine-readable metric reports, Quality Baseline calibration, and automated geometry, appearance, compactness, performance, determinism, and Reference Independence gates.

GLB decoding, one-off object analysis, extracted cross-sections or images, fitting histories, and external Python, Blender, C++, WASM, CSG, or SDF experiments are disposable or development-only. A generator must not depend on Lab slots, display normalization, camera, lighting, source-node identifiers, or extracted dense data.

#### Experiment success, failure, and exit

Stone Path succeeds only when the complete vertical slice passes all frozen geometry, appearance, compactness, performance, determinism, and Reference Independence gates. Its success demonstrates the workflow and infrastructure, not the general hypothesis by itself.

The core hypothesis is supported when Stone Path, Stone, Vase, and Umbrella all pass in strict sequence through the same minimal contract and evaluation protocol. Formal Single Mesh Lab exit additionally requires Bamboo Shoot and Mushroom to pass category-appropriate frozen thresholds and budgets established before their implementation begins.

The experiment does not declare success when only simple extrusion, deformation, or lathe objects pass while the radial compound, open layered, or repeated organic classes fail.

A required object that fails after two reasonable compact representations triggers a review of the representation choice, the Exact-ish threshold, and the dependency boundary; thresholds are not relaxed automatically. If at least two objects require over-budget code or mesh-like retained data, the compact-program hypothesis is materially weakened. If at least two objects independently require the same missing geometry operation, the project reevaluates a shared internal layer or third-party Runtime Kernel. If a representation requires WASM for only one special case, it remains a development experiment rather than a production dependency.

The minimal Object Generator contract changes only when two implementations expose the same missing responsibility or when a required long-term capability cannot be added outside it. A single object's convenience request is insufficient.

After formal six-object exit, the project starts a new full-island `/grill-with-docs` round using the measured evidence. Multi-mesh compound objects may begin after Umbrella passes because it validates a semantic multi-part root. Terrain/path/layout/scatter work begins only after formal Single Mesh Lab exit and its own bounded experiment/specification. Full-island work may then proceed through `/to-spec`, `/to-tickets`, and `/implement`; this specification does not authorize full-island tickets.

## User Stories

1. As a reconstruction researcher, I want one frozen, quantitative definition of Exact-ish Reconstruction so that I can distinguish a failed representation from a persuasive single screenshot and cannot move the acceptance bar after seeing replacement results.
2. As an Object Generator author, I want each Authored Reference expressed in source-scene units and a recoverable Reconstruction Frame so that my generator remains useful outside the normalized Lab and can later be placed in the island without compensating transforms.
3. As an Object Generator author, I want a small typed recipe with separate shape and appearance parameters and explicit deterministic randomness so that the reconstructed object is understandable, editable, reproducible, and reviewable as a program.
4. As an evaluator, I want the reference to determine all cameras, transforms, lighting, and pass settings so that a replacement cannot improve its score by being independently normalized, centered, framed, or lit.
5. As an evaluator, I want fixed multi-view silhouette, depth, normal, albedo, lit RGB, and semantic captures with aggregate and worst-view metrics so that errors hidden in one view or one rendering pass remain visible.
6. As a developer fitting a replacement, I want overlay, difference, and individual-pass previews backed by the same metrics used in acceptance so that I can diagnose whether a mismatch comes from geometry, appearance, framing, or semantics.
7. As a performance owner, I want scalar, recipe-byte, bundle-byte, triangle, draw-call, geometry-memory, and generation-time budgets measured by explicit methods on a named baseline machine so that compactness is a testable production property rather than a subjective code review opinion.
8. As a production maintainer, I want a replacement-only build and offline audit that removes Authored References and blocks the network so that GLB loaders, CDNs, cached textures, dense samples, or hidden serialized geometry cannot accidentally become production dependencies.
9. As an architecture owner, I want purpose-built Three.js generators to earn shared abstractions through repeated evidence so that the project learns what its geometry vocabulary actually is before committing to a general DSL, CSG kernel, SDF system, or WASM runtime.
10. As a future island assembler, I want each replacement to expose one stable semantic root while permitting meaningful child meshes so that export batching does not dictate domain structure and repeated geometry/materials can later be instanced or shared.
11. As a future interaction or collision implementer, I want semantic IDs and deterministic CPU structure to remain stable even when GPU appearance varies so that selection, semantic passes, collisions, layout, and animation are not coupled to nondeterministic shader output.
12. As a reviewer, I want all source-resolution-dependent data and fitting artifacts isolated to development tools so that a compact-looking recipe cannot conceal copied vertex, texture, point-cloud, or sampling data.
13. As the full-island project owner, I want the experiment to cover extrusion, organic deformation, lathe, radial compound, open layered, and repeated organic classes before exit so that success meaningfully reduces later scene risk rather than proving only the easiest props.
14. As the full-island project owner, I want explicit stop and reconsideration rules when multiple objects exceed budgets or need the same missing operation so that external geometry dependencies are adopted from evidence and not from repository popularity or anticipated complexity.
15. As an integrated-scene reviewer, I want available Procedural Replacements assembled in their corresponding positions in the Eight-slot Lab Reference Layout so that stage delivery preserves the shared reference composition without falling back to per-object scenes or Authored Reference assets.

## Implementation Decisions

- Treat the existing authored-reference gallery as ground-truth input and presentation evidence, not as the production architecture.
- Implement Stage 0 before fitting Stone Path; freeze the Quality Baseline after one allowed calibration correction.
- Use the three highest seams described above: Object Generator, Evaluation Harness, and replacement-only production boundary.
- Preserve the Reconstruction Frame and original scene units inside generators; apply canonical seven-unit normalization only inside evaluation.
- Keep generators independent of Lab placement, then compose available Procedural Replacements at the delivery boundary using the shared Eight-slot Lab Reference Layout; unfinished slots remain empty.
- Keep one semantic object root while allowing multiple generated child meshes and optional initialization-time merging.
- Use direct Three.js and project-owned generators for Stage 1. Do not add production WASM, CSG, SDF, a general operation tree, or a scene DSL.
- Keep geometry and appearance parameters separate, and require an explicit versioned integer RNG with no ambient randomness.
- Retain only Semantic Measurements whose representation size is independent of source and analysis resolution.
- Keep ground-truth loading and analysis dependencies one-way: evaluation may consume production generators; production may not consume evaluation or ground truth.
- Expose reproducible developer operations for ground-truth extraction, baseline calibration, capture, per-object evaluation, full Stage 1 acceptance, determinism checks, performance measurement, and Reference Independence audit. Exact command names are selected during ticketing, but each operation must run non-interactively and emit a failing exit status plus a machine-readable report.
- Record the normative benchmark environment in each performance report. A baseline hardware, OS, browser, or Three.js change requires an explicit baseline migration and comparison run, not silent replacement.
- Do not begin a later object until the prior object passes its complete gate set. Do not begin Stage 2 until Bamboo Shoot and Mushroom thresholds and budgets have been calibrated, reviewed, and added to this specification or a superseding accepted decision.

## Testing Decisions

The testing strategy is layered around the three public seams.

At the Object Generator seam, automated tests verify recipe validation, versioned RNG behavior, stable semantic IDs, no `Math.random()`, Reconstruction Frame orientation and bottom anchor, deterministic structure, typed-array output, bounds, triangle counts, draw calls, and disposal-safe repeated generation. Metric helpers receive small synthetic masks and buffers with analytically known results to verify IoU, symmetric contour distance, depth normalization, Delta E, SSIM masking, percentile calculations, and worst-view aggregation.

At the Evaluation Harness seam, golden protocol tests verify the exact twelve camera poses, reference-derived framing, identical reference/replacement matrices, 512-square pass dimensions, pass color/depth/normal conventions, controlled perturbation ordering, machine-readable schema, and nonzero failure exit status. Golden outputs freeze protocols and metrics rather than replacement screenshots that would conceal renderer drift.

Each Reconstruction Unit runs black-box geometry, appearance, compactness, timing, and deterministic acceptance using the thresholds in this specification. Reports retain per-view values, aggregates, worst views, images needed for diagnosis, environment metadata, recipe/scalar counts, bundle accounting, and generator timing distributions.

At the production-system seam, acceptance builds only the replacement runtime, makes authored directories unavailable, empties browser cache, blocks network access, performs a static payload/import scan, loads the scene, generates every in-scope object, and verifies that no request or import reaches ground-truth code or prohibited assets.

Performance hard gates run on the normative Chrome baseline. Cross-browser Chrome/Firefox/Safari runs enforce structural determinism, bounds tolerance, pass availability, and frozen visual tolerances; their raw timings remain diagnostic until separate baselines are declared.

The Stage 1 acceptance run passes only when all four objects pass every hard gate and the aggregate bundle and sequential-generation budgets. A failed hard metric cannot be offset by a better score in another metric.

## Out of Scope

- Implementing or ticketing the complete island village.
- Reconstructing terrain, coastline, waterline, roads, bridges, structures, vegetation systems, scatter/layout, sky, water, fog, wind, wildlife, or full-scene interactions in this experiment.
- Designing the final SceneRecipe DSL, universal modeling language, node graph, operation tree, or custom general-purpose mesh kernel.
- Autonomous mesh-to-program synthesis, neural reconstruction, or automatic recovery of an authored operation history.
- Reproducing source topology, vertices, indices, UV layout, disconnected-component layout, or authoring-tool pivots for their own sake.
- Shipping authored GLB, textures, heightfields, dense measurements, model CDN dependencies, or offline analysis runtimes in production.
- Approving Manifold or any other WASM dependency for production.
- Adding speculative collider, LOD, tags, sockets, animation, scatter, caching, or layout fields to the first generator contract.
- Defining final scene-level performance budgets or proving full-island frame time.
- Making Blue Hat and Candle part of the formal six-object Lab exit; both remain mandatory later.

## Further Notes

### Known source evidence

The selected references span more than triangle-count complexity. Stone Path is one closed irregular extrusion; Stone is one closed low-poly volume. Bamboo Shoot has multiple components and open boundaries. Blue Hat has multiple components. Vase is one component with a lathed silhouette. Candle has multiple components and includes a carved pedestal. Mushroom is a five-part repeated object. Umbrella contains many disconnected exported components. Several objects carry authored textures, so appearance cannot be inferred from the “single material” label alone.

This evidence justifies separating source export structure from replacement semantic structure and evaluating geometry before appearance.

### Third-party research disposition

Manifold is the most plausible later browser-side boolean kernel but adds an asynchronous WASM runtime, lifecycle management, and measurable payload/init cost; it is not justified by Stage 1. OpenSCAD is a desktop C++/GPL tool and only an expression-model reference. libfive is a C++ implicit-modeling reference rather than a direct browser dependency. Sverchok and Geometry Nodes/geonodes depend on Blender and are workflow references. fogleman/sdf is a Python sampling/meshing tool suitable only for offline experiments. License, distribution, browser integration, and runtime cost must be rechecked at the time of any future adoption.

### Remaining questions and staged preconditions

There is no unresolved product decision blocking Stage 0 or Stage 1 ticketing. Before implementation begins, `/to-tickets` must assign ownership and dependency order for the Stage 0 infrastructure and the four strict Stage 1 tracer bullets without creating full-island tickets.

Before Stage 2 implementation, Bamboo Shoot and Mushroom require the same one-time sensitivity calibration used by Stage 1, followed by frozen category-specific geometry, appearance, compactness, and runtime limits. Their likely representations are hypotheses until that evidence exists.

Before any production Runtime Kernel is proposed, at least two completed Reconstruction Units must document the same missing operation and show that two reasonable direct representations failed or exceeded budgets. The proposal must then compare license, local/offline packaging, incremental bundle size, initialization, geometry generation, determinism, lifecycle, and `THREE.BufferGeometry` conversion.

After six-object exit, a new `/grill-with-docs` round must use the measured failures, helper reuse, bundle costs, and metric behavior to decide the next experiment boundary. That round, not this specification, determines whether to proceed first to compound structures, terrain/path systems, or layout/scatter and when to specify the complete island.
