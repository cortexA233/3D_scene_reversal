# Procedural Scene Reversal

This context describes the reconstruction of an authored 3D scene as a compact, semantic, deterministic program while preserving the authored scene as measurable ground truth.

## Language

**Authored Reference**:
An original artist-created scene or object retained as ground truth for measurement and comparison, but excluded from the delivered runtime.
_Avoid_: Source asset, production asset

**Immutable Reference Capture**:
An authoritative rendering produced by observing the Authored Reference through its frozen public camera controls without changing its code, scene graph, materials, lighting, atmosphere, or post-processing.
_Avoid_: Normalized reference render, corrected reference, shared-lighting render

**Assembled Authored Scene**:
The ready, fully composed reference scene whose final world transforms, visibility, geometry, materials, lights, procedural environment, and overrides are authoritative for scene measurement.
_Avoid_: Raw GLB coordinates, offline asset layout, extractor reconstruction

**Reference Source Evidence**:
Development-only use of the Authored Reference implementation source to interpret, measure, and fit the Assembled Authored Scene; audited general algorithms and compact semantic parameters may be promoted into independent production modules, but production may not import or inspect the reference implementation.
_Avoid_: Runtime source extraction, reference-code dependency, source-as-recipe

**Frozen Observation Clock**:
The development-side browser time control that advances and pauses an otherwise unmodified scene at declared moments so dynamic Immutable Reference Captures and replacement captures are repeatable.
_Avoid_: Animation patch, fixed screenshot delay, scene time override

**Reference Analysis Projection**:
A development-only analytical representation derived by read-only inspection of Authored Reference geometry for auxiliary geometry evidence; it is separate from, and never presented as, an Immutable Reference Capture.
_Avoid_: Modified reference scene, neutral reference, production proxy

**Candidate Adapter**:
The evaluation-side read-only exposure of the actual generated production scene and its semantic index without transient normalization, reframing, fitting, hidden transform correction, or replacement-specific content.
_Avoid_: Comparison normalizer, evaluation fixup, fitted candidate scene

**Reference-guided Fitting Loop**:
The development-only iteration that reads an immutable reference, measures candidate error, persists permitted corrections into the Scene Recipe or production generator implementation, regenerates through the real production path, and evaluates the new result.
_Avoid_: Candidate Adapter correction, runtime ground truth, evaluation-only fit

**Semantic Coverage Manifest**:
The development-only accounting that classifies every renderable reference geometry, light, and visible environment layer into a declared scene semantic role or an explicitly justified exclusion, with entity, surface-area, and Normative Scene Capture visibility coverage.
_Avoid_: Extractor allowlist, recognized mesh count, ignored nodes

**Semantic Measurement**:
A compact value derived from an Authored Reference that names a generator-relevant property and whose representation size is independent of source mesh, texture, or sampling resolution.
_Avoid_: Extracted mesh data, compressed vertex data, baked sample array

**Identity-bearing Scene Entity**:
A scene element whose individual identity and world-space relationship are meaningful enough to require one-to-one correspondence between the Authored Reference and Procedural Replacement.
_Avoid_: Layout item, matched mesh, scene instance

**Scene Semantic ID**:
The stable production-safe identity that joins one Identity-bearing Scene Entity across its Scene Recipe, generated hierarchy, semantic capture, and evaluation history without exposing Authored Reference node identifiers or depending on array order.
_Avoid_: Source node ID, array index, generated UUID

**Distributed Scene Cover**:
A dense population of small scene elements without meaningful individual identity, reconstructed and compared by semantic occupancy and spatial distribution rather than arbitrary instance pairing.
_Avoid_: Unmatched objects, random clutter, background assets

**Scene Geometry Evidence**:
Development-only evidence obtained by directly comparing reference and replacement geometry in their shared world frame, including semantic placement, surface distance, terrain, coastline, sea-plane, and horizon measurements.
_Avoid_: Screenshot score, retained geometry sample, production measurement data

**Scene Surface Parity**:
Topology-independent equivalence between reference and replacement surfaces, evaluated by deterministic bidirectional world-space distance together with visible geometry and explicitly declared semantic-structure checks.
_Avoid_: Vertex match, triangle-topology copy, bounds-only fit

**Scene Placement Anchor**:
The world-space location of an Identity-bearing Scene Entity's Reconstruction Frame origin: the bottom-center of the entity's complete reference-geometry axis-aligned bounding box. A generator reproduces this origin without hidden placement offsets or empirical scale corrections.
_Avoid_: Object position, authored pivot, visual center, ground point

**Scene Anchor**:
The fixed world-space island datum at `[86,26,-24]` used for terrain and coastline semantics, spatial statistics, the top-down evaluation frame, and the normative Horizon Profile independently of any camera target.
_Avoid_: Overview target, island bounds center, camera focus

**Scene Recipe**:
The sole production-safe scene-specific artifact that defines world layout, semantic grouping, generator selection, placement contracts, material-family references, environment parameters, and bounded population or terrain programs without retaining Authored Reference content.
_Avoid_: Extracted layout, scene manifest, generator registry

**Scene Generator**:
The production module that composes local Object Generator results, terrain, ocean, horizon, environment, and distributed populations into the world-space Procedural Replacement according to a Scene Recipe.
_Avoid_: Object factory, evaluation builder, reference adapter

**Target AABB Extent**:
The complete final world-axis-aligned bounding-box dimensions an Identity-bearing Scene Entity must reproduce after generation and placement. It is a hard output target rather than a generator scale hint or a semantic part dimension.
_Avoid_: Size, approximate bounds, model scale

**Scene Orientation**:
An entity's declared orientation semantics in the shared `+Y`-up world frame: directed `heading` uses local `+Z` as forward, undirected `axis` is equivalent modulo 180 degrees, `radial` has no yaw gate, and `surface-aligned` adds a support-normal relationship to a heading or axis.
_Avoid_: PCA yaw, rotation hint, visual direction

**Scene Evaluation Camera Set**:
The fixed, reference-framed cameras used to evaluate full-scene layout and visible parity: one authored overview, one top-down layout view, and four opposing oblique views. The set is never reframed from the Procedural Replacement.
_Avoid_: Screenshot angles, candidate-fitted cameras, free-fly views

**Normative Scene Capture**:
The `1440x810` CSS-pixel and framebuffer capture at device scale factor 1 under Three.js r170 used for blocking scene-render evidence across the Scene Evaluation Camera Set.
_Avoid_: Current browser window, Retina screenshot, diagnostic render

**Scene Render Contract**:
The versioned, machine-verifiable camera, renderer, global and local lighting, shadow, atmosphere, sky, ocean, cloud, post-processing, URL-option, and observation-time conditions that define an Immutable Reference Capture and the appearance target for the independent Procedural Replacement.
_Avoid_: Screenshot settings, shared lighting, visual preset

**Environment Recipe**:
The production-side semantic parameters that independently reproduce the scene's global sun, hemispheric and ambient illumination, atmosphere, sky, ocean environment, shadows, and post-processing under the Scene Render Contract.
_Avoid_: Shared evaluation lighting, renderer preset, baked look

**Semantic Light**:
An identity-bearing local scene light with stable placement, color, intensity, range, shadow behavior, and an explicit relationship to its emissive source entity.
_Avoid_: Lighting JSON record, baked glow, anonymous point light

**Scene Parity Gate Stack**:
The non-compensating acceptance hierarchy of structural correspondence, world-space geometry, fixed-camera geometry, and native appearance evidence, each retaining aggregate and worst-case results under a pre-calibrated Quality Baseline.
_Avoid_: Similarity score, weighted visual grade, average screenshot metric

**Scene Parity Foundation**:
The milestone that freezes immutable reference observation and scene semantics, establishes calibrated deterministic 3D and rendered comparison, and records an honest candidate baseline without requiring the current Procedural Replacement to pass final parity gates.
_Avoid_: Full-island completion, visual tuning pass, green baseline

**Human Parity Review**:
The final visual assessment performed only after the Scene Parity Gate Stack passes; it cannot waive an automated failure, and any clear residual mismatch it finds must become explicit evidence and a separately calibrated gate revision rather than an unexplained exception.
_Avoid_: Eyeballing, approval override, subjective screenshot sign-off

**Horizon Profile**:
The world-space elevation angle of visible distant geometry as a function of azimuth around a fixed reference-defined scene anchor.
_Avoid_: Mountain screenshot, skyline pixels, camera crop

**Horizon Group**:
An Identity-bearing Scene Entity representing one authored distant-mountain group with its own placement, bounds, orientation, and compact multi-form controls; all groups jointly determine the Horizon Profile.
_Avoid_: Background ring, enlarged Stone, random mountain cone

**Semantic Sea Level**:
The static world-space plane that defines the scene's canonical water elevation, land/sea classification, and vertical layout relationships independently of animated surface waves.
_Avoid_: Water mesh height, wave surface, ocean shader position

**Ocean Appearance Surface**:
The independently generated visible water layer whose frozen phase, displacement, shading, transparency, and reflections reproduce the Authored Reference without redefining the Semantic Sea Level.
_Avoid_: Sea plane, coastline datum, animated sea level

**Procedural Replacement**:
A compact, semantic, parameterized reconstruction generated without loading its Authored Reference.
_Avoid_: Generated copy, converted mesh

**Object Generator**:
A deterministic, object-specific program that builds a Procedural Replacement from a compact semantic recipe in object-local coordinates.
_Avoid_: Mesh converter, universal modeler

**Bounded Support-plane Polyhedron**:
A compact closed-volume representation formed by intersecting a fixed maximum number of semantic support planes, with representation size independent of Authored Reference face or vertex count.
_Avoid_: Source-face replica, sampled hull, expanded loft

**Deterministic Generation**:
Generation whose recipe and explicit versioned seed fully determine semantic IDs, structural choices, topology, and CPU-side geometry without ambient randomness, time, device state, or GPU results.
_Avoid_: Visually stable, mostly repeatable, fixed `Math.random`

**Scene Seed Derivation**:
The stateless derivation of isolated geometry, material, distribution, and environment random streams from one versioned root scene seed plus a stable semantic identity and purpose label.
_Avoid_: Global sequential RNG, per-entity seed inventory, array-order randomness

**Exact-ish Reconstruction**:
A Procedural Replacement that is observationally equivalent to its Authored Reference within declared tolerances across fixed multi-view evaluation passes while also meeting compactness, editability, determinism, and performance constraints; it need not reproduce source topology, UVs, vertices, or authoring history.
_Avoid_: Exact copy, pixel match, looks similar

**Production Runtime**:
Everything required to run the delivered scene offline, including executable dependencies and retained data, but excluding Authored References and authoring-only tools.
_Avoid_: Final code, browser code

**Code-only Production Runtime**:
A Production Runtime whose scene-specific content consists of executable code, shaders, deterministic seeds, and compact semantic parameters; approved general-purpose Runtime Kernels are allowed, but Authored References and object-specific serialized geometry or sampled appearance data are not.
_Avoid_: Pure code, no-GLB runtime, asset-free runtime

**Bounded Semantic Pattern Program**:
A resolution-independent appearance representation that computes a hero prop's pattern from semantic surface coordinates using a fixed-cap composition of analytic motifs, compact vector controls, layers, symmetry, repetition, and domain transforms.
_Avoid_: Procedural texture, vectorized bitmap, sampled shader table

**Bounded Semantic Terrain Program**:
A fixed-cap, resolution-independent description of coastline curves, named analytic landforms, deterministic noise, and their composition that generates terrain without retaining height samples or source-resolution geometry.
_Avoid_: Procedural heightfield, sampled coastline, encoded terrain mesh

**Material Family**:
A stable semantic surface category whose code-generated parameters and bounded pattern variants preserve meaningful authored color, roughness, transparency, emission, and motif differences without retaining source textures.
_Avoid_: Flat palette slot, source material ID, texture clone

**Reference Independence**:
The property that the Production Runtime builds and runs offline when Authored References and their loaders, manifests, and measurement artifacts are absent.
_Avoid_: No GLB request, cached offline mode

**Runtime Kernel**:
A general-purpose algorithmic dependency executed by the Production Runtime that contains no object-specific authored geometry or sampled appearance data.
_Avoid_: Generated asset, embedded model

**Single Mesh Lab**:
The object-level experiment that tests reconstruction representations, workflow, and quality gates before full-scene reconstruction; “single mesh” describes each selected Authored Reference, not the required render-tree structure of its Procedural Replacement.
_Avoid_: Island MVP, full-scene prototype

**Stage 1.5 Decision Gate**:
A blocking evidence phase between the frozen Stage 1 result and Stage 2 implementation that resolves the failed representation and browser-evidence decisions without counting further exploration as Stage 2 progress.
_Avoid_: Stage 2 preview, cleanup sprint, evidence backlog

**Reconstruction Unit**:
An object-level evaluation pair consisting of one Authored Reference and its Procedural Replacement in the same canonical comparison slot; the replacement is one semantic object but may contain multiple generated render parts.
_Avoid_: Mesh slot, test mesh

**Reconstruction Frame**:
The recoverable object-local frame constructed from baked source geometry by preserving source-world axis orientation and moving its world-space bottom-center to the origin; it does not claim to recover an unobservable authoring-tool pivot or transform.
_Avoid_: Authored local frame, original pivot, Lab frame

**Evaluation Harness**:
The development-only system that places a Reconstruction Unit under fixed comparison conditions, captures evaluation passes, derives quality and performance measurements, and audits independence from Authored References.
_Avoid_: Lab UI, generator diagnostics, production telemetry

**Evaluation View Set**:
The fixed, reference-framed multi-view camera set used by the Evaluation Harness for every pass of a Reconstruction Unit; it is never reframed from the Procedural Replacement.
_Avoid_: Screenshot angle, focus view, replacement-fitted camera

**Native GPU Visual Gate**:
A cross-browser acceptance gate produced by a hardware-accelerated browser rendering both members of a Reconstruction Unit through the complete fixed evaluation protocol and applying the object's accepted Quality Baseline within that browser.
_Avoid_: Browser screenshot, GPU smoke test, engine-shell evidence

**Quality Baseline**:
The fixed acceptance thresholds calibrated from reference repeatability and controlled reference perturbations before replacement fitting begins.
_Avoid_: Target score, tuned threshold, visual bar

**Calibration Bracket**:
The reference-only evidence interval between declared mild perturbations that an Exact-ish Reconstruction should tolerate and declared structural or appearance damage that it must reject; a threshold is valid only when the two classes remain separable.
_Avoid_: Sensitivity sweep, threshold tuning range, candidate margin

**Category-specific Quality Baseline**:
A Quality Baseline calibrated for one object or shape category before its Procedural Replacement is fitted; it may be looser or stricter than an earlier category's values when sensitivity evidence supports the difference, but it may not be chosen in response to a candidate failure.
_Avoid_: Inherited threshold, difficulty discount, post-fit adjustment

**Patterned Appearance Baseline**:
A Category-specific Quality Baseline for hero patterned objects, calibrated from Authored Reference pattern perturbations before candidate fitting and versioned separately from historical baselines; it remains valid only while materially wrong palette, motif-family, coverage, and phase controls still fail.
_Avoid_: Texture discount, Umbrella exception, retroactive pass

**Ground Truth Extractor**:
The development-only tool that derives object-independent geometric, topology, transform, and material facts from Authored References without attempting to invent an Object Generator.
_Avoid_: Mesh decompiler, automatic model converter

**Scene Decompiler Workflow**:
A repeatable, human-guided and measurement-assisted process that turns an Authored Reference into a Procedural Replacement; it may automate evidence extraction and parameter fitting without automatically inventing the generator program.
_Avoid_: Automatic mesh converter, one-click reconstruction

## Shared facts

- Stage 1 uses the frozen `single-mesh-quality-baseline-v1` thresholds for Stone Path, Stone, Vase, and Umbrella. Browser calibration passed 29 repeatability, identity, sensitivity-ordering, diagnostic, and policy checks without using the one permitted pre-fitting correction.
- Future Category-specific Quality Baselines, including those for Bamboo Shoot and Mushroom, may use looser numerical tolerances than Stage 1 when pre-implementation sensitivity calibration justifies them; the frozen Stage 1 values remain unchanged.
- The Stage 1 `single-mesh-quality-baseline-v1` and its two-of-four result remain historical evidence. Stage 1.5 may evaluate a new Umbrella candidate against a separately pre-calibrated Patterned Appearance Baseline v2 whose appearance tolerances may be materially looser, while Umbrella geometry gates and nonvisual budgets remain unchanged.
- Patterned Appearance Baseline v2 may be loosened during reference-only pre-calibration, but a flat canopy, wrong dominant palette, deleted major motif family, materially reduced pattern coverage, and large phase or pattern-scale errors must still fail; no further loosening is permitted after candidate fitting begins.
- Firefox and Safari evidence for an otherwise-qualified candidate requires a Native GPU Visual Gate with two stable full-protocol capture runs, recorded browser/OS/Three.js/GPU/color metadata, and an explicit rejection of software rendering. JavaScriptCore and SpiderMonkey structure/bounds signatures do not satisfy this gate.
- Bamboo Shoot and Mushroom receive separate Category-specific Quality Baselines and separate compactness/runtime budgets, calibrated and frozen together during Stage 1.5 before either Stage 2 candidate is fitted. They share the evaluation protocol and cross-browser gates, but a failure or later finding for one cannot change the other's frozen values.
- Every new Category-specific Quality Baseline requires a Calibration Bracket: identity and declared mild perturbations pass, declared destructive controls fail, and a metric that cannot separate the two before candidate fitting is revised or made diagnostic rather than loosened until both pass.
- Bamboo Shoot's Calibration Bracket uses the common scale, pivot, and rotation ladders plus taper, sheath tilt/twist, and axial-spacing ladders at mild/intermediate/severe levels. Its destructive controls delete a major sheath, reduce visible layering, collapse the open separated construction into a closed cone, remove the dominant flared silhouette element, flatten the appearance, corrupt the dominant palette, delete a major motif family, or halve pattern coverage.
- Mushroom's five closed source components are five complete repeated organic forms with similar topology but materially different height, scale, orientation, and placement. Its Calibration Bracket perturbs per-form size, cap/stem proportion, lean, placement, and cap resolution, while destructive controls delete a visible member or major part, collapse the group to one form, erase inter-form variation, swap dominant scale/layout roles, flatten appearance, corrupt the palette, delete a motif family, or halve pattern coverage.
- The frozen calibration report is development-only evidence. Its per-view metrics, checksums, source topology diagnostics, and perturbation results are prohibited from the Code-only Production Runtime just like other Ground Truth measurements.
- The frozen Stage 1 certification result is negative: Stone Path and Vase pass every object gate, Stone fails contour and depth-tail geometry gates, and Umbrella passes geometry but fails procedural-appearance gates. The required core-hypothesis result is therefore two of four, and formal Single Mesh Lab exit is not claimed.
- Stage 1's combined production constraints pass independently of its visual failures: the four-object bundle is 7,714 bytes gzip excluding Three.js, sequential warm generation is 1.6 ms p95 on the normative machine, and the replacement runtime has no WASM or runtime textures and renders in the isolated offline audit.
- Stage 1 does not trigger a shared geometry layer or third-party Runtime Kernel. No missing geometry operation recurred across two generators, and all four generators met their compactness and runtime budgets. Umbrella instead triggers a future review of compact procedural appearance and the Code-only Production Runtime boundary for hero patterned objects.
- Stone Path's footprint extrusion and Vase's hollow lathe/procedural gradient are accepted production candidates. Stone's compact loft and Umbrella's radial assembly/procedural flower shader are retained negative experiments, not accepted Exact-ish Procedural Replacements.
- Stone's sole second compact representation candidate is a Bounded Support-plane Polyhedron under the frozen Stone quality and nonvisual budgets; adding more rings to the retained compact loft does not count as a distinct representation.
- A Bounded Semantic Pattern Program is permitted within the Code-only Production Runtime for hero patterned objects. Its object-specific controls count against the existing scalar and bundle budgets, while textures, pixel or sample tables, resolution-scaled paths, and sampled appearance disguised as shader constants remain prohibited.
