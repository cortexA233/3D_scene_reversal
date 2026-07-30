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

**Normative Observation Host**:
The OS, browser, and rasterizer-backend combination under which blocking scene evidence is captured; one host owns the authoritative Immutable Reference Observation profile and every other host records its own profile while reproducing all scene-determined evidence exactly.
_Avoid_: Test machine, CI runner, browser version

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

**Object-specific Scalar**:
A numeric choice that encodes one Reconstruction Unit's geometry or appearance, regardless of whether it appears in a recipe, Object Generator, generated shader source, or object-specific helper; documented universal algorithm and control-flow constants are excluded.
_Avoid_: Recipe scalar, exposed parameter, JSON number

**Procedural Replacement**:
A compact, semantic, parameterized reconstruction generated without loading its Authored Reference.
_Avoid_: Generated copy, converted mesh

**Object Generator**:
A deterministic, object-specific program that builds a Procedural Replacement from a compact semantic recipe in object-local coordinates.
_Avoid_: Mesh converter, universal modeler

**Bounded Support-plane Polyhedron**:
A compact closed-volume representation formed by intersecting a fixed maximum number of canonical-direction semantic support planes, with representation size independent of Authored Reference face or vertex count.
_Avoid_: Source-face replica, sampled hull, expanded loft

**Axial Layer Family**:
A compact generative group of open surface elements that share a semantic profile and vary through bounded axial progression, spacing, taper, phase, tilt, or twist controls rather than copied per-component transforms.
_Avoid_: Component array, copied sheath set, open-mesh samples

**Repeated Organic Form**:
A semantic member of a compact generated group that shares one organic-form generator while retaining bounded editable variation in placement, scale, proportion, orientation, lean, and seed.
_Avoid_: Mesh copy, cloned source component, identical scatter instance

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
The development-only object experiment that tests reconstruction representations, workflow, and quality gates before full-scene reconstruction; its Authored Reference and Evaluation Harness surfaces are not final deliverables.
_Avoid_: Island MVP, full-scene prototype

**Eight-slot Lab Reference Layout**:
The fixed shared arrangement established by Single Mesh Lab for its eight Reconstruction Units, including their canonical comparison slots, normalized display scale, orientation, and common viewing context.
_Avoid_: Island-village layout, source-world layout, authored-world restoration

**Reference-layout Delivery**:
The integrated Code-only scene that places Procedural Replacements in their corresponding positions within the Eight-slot Lab Reference Layout; staged previews may leave unfinished slots empty, but formal delivery contains all eight and per-object scenes are excluded from delivery.
_Avoid_: Per-object deliverable, object showcase scene, isolated final scene

**Stage 1.5 Decision Gate**:
A blocking evidence phase between the frozen Stage 1 result and Stage 2 implementation that resolves the failed representation and browser-evidence decisions without counting further exploration as Stage 2 progress.
_Avoid_: Stage 2 preview, cleanup sprint, evidence backlog

**Versioned Category Exit**:
A formal Single Mesh Lab exit in which all eight Reconstruction Units pass their declared Category-specific Quality Baselines and the report preserves each baseline version without rewriting an earlier tranche's result.
_Avoid_: Mixed-baseline score, retroactive Stage 1 pass, aggregate recovery

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
The fixed acceptance thresholds calibrated from reference repeatability and controlled reference perturbations before replacement fitting begins, except when a separately recorded Quarantined Rebaseline supplies the stricter candidate-isolation procedure.
_Avoid_: Target score, tuned threshold, visual bar

**Calibration Bracket**:
The reference-only evidence interval between declared mild perturbations that an Exact-ish Reconstruction should tolerate and declared structural or appearance damage that it must reject; a threshold is valid only when the two classes remain separable.
_Avoid_: Sensitivity sweep, threshold tuning range, candidate margin

**Quarantined Rebaseline**:
A one-time, separately versioned Category-specific Quality Baseline reset authorized after a candidate result is already known; it uses only a predeclared Authored Reference perturbation manifest and threshold-selection rule while the exposed candidate is commit- and hash-frozen and excluded from calibration inputs.
_Avoid_: Post-fit tuning, candidate-fit tolerance, retroactive pass

**Representation Contract Failure**:
A negative experiment in which its fitter, recipe, Object Generator, or Evaluation Harness assigns different semantics to the same compact parameters; its artifact measurements remain factual, but it is not evidence that the representation family failed.
_Avoid_: Bad fit, representation failure, threshold problem

**Fitting Reproducibility Failure**:
A development-tool defect in which a fitter cannot regenerate a production recipe under the Object Generator's declared semantics, while an independently corrected refit may prove that the existing recipe and generated artifact were already valid.
_Avoid_: Candidate failure, representation failure, production regression

**Geometry-conditioned Appearance Evidence**:
An appearance measurement whose value materially changes with surface geometry or normals even when albedo, palette, and material parameters are identical; it is not an independent appearance hard gate after those geometric differences are accepted by a separately calibrated baseline.
_Avoid_: Texture error, material mismatch, independent appearance score

**Category-specific Quality Baseline**:
A Quality Baseline calibrated for one object or shape category, normally before its Procedural Replacement is fitted; it may be looser or stricter than an earlier category's values when reference sensitivity evidence supports the difference, but after fitting it may change only through an explicit Quarantined Rebaseline.
_Avoid_: Inherited threshold, difficulty discount, post-fit adjustment

**Patterned Appearance Baseline**:
A Category-specific Quality Baseline for hero patterned objects, calibrated from Authored Reference pattern perturbations before candidate fitting and versioned separately from historical baselines; it remains valid only while materially wrong palette, motif-family, coverage, and phase controls still fail.
_Avoid_: Texture discount, Umbrella exception, retroactive pass

**Human-anchored Patterned Appearance Baseline**:
A separately versioned Category-specific Quality Baseline for a complex authored pattern that names a human-approved Procedural Replacement as a positive semantic exemplar alongside the Authored Reference and requires destructive variants to remain separable; it explicitly records that the evidence is candidate-informed and never rewrites a candidate-independent baseline result.
_Avoid_: Manual override, hidden post-fit tuning, retroactive pass

**Semantic Pattern Recall**:
A historical patterned-v2 reference-side appearance measurement for a declared motif family, such as flower, leaf, or branch, that measures same-position albedo retention separately from permissive global color and SSIM gates.
_Avoid_: Texture mask score, candidate motif bonus, palette cluster count

**Semantic Pattern Coverage**:
A position-tolerant rendered measurement that checks whether declared motif families retain bounded visible coverage and their declared role palette without requiring source and replacement pixels to occupy identical image coordinates.
_Avoid_: Pixel recall, texture match, unbounded motif presence

**Semantic Material Role Coverage**:
A position-tolerant rendered measurement for a procedurally mottled object that checks bounded visible coverage and evaluation-space color distance for declared material roles, such as a brown core and green sheaths, while exact texel position remains diagnostic.
_Avoid_: Texture discount, dominant-color-only pass, unconstrained palette similarity

**Object-scoped Candidate Freeze**:
A candidate quarantine whose hashed binding surface is the Reconstruction Unit's object definition, recipe, generator, and shared generation kernel rather than an aggregate registry that also changes for unrelated objects.
_Avoid_: Registry freeze, mutable candidate alias, repository-wide candidate hash

**Ground Truth Extractor**:
The development-only tool that derives object-independent geometric, topology, transform, and material facts from Authored References without attempting to invent an Object Generator.
_Avoid_: Mesh decompiler, automatic model converter

**Scene Decompiler Workflow**:
A repeatable, human-guided and measurement-assisted process that turns an Authored Reference into a Procedural Replacement; it may automate evidence extraction and parameter fitting without automatically inventing the generator program.
_Avoid_: Automatic mesh converter, one-click reconstruction

## Shared facts

- Reference-layout Delivery means the Eight-slot Lab Reference Layout, not island-village source-world placement. A stage populates only the slots for its available Procedural Replacements and never fills unfinished slots with Authored Reference assets; formal delivery requires all eight slots.
- Stage 1 uses the frozen `single-mesh-quality-baseline-v1` thresholds for Stone Path, Stone, Vase, and Umbrella. Browser calibration passed 29 repeatability, identity, sensitivity-ordering, diagnostic, and policy checks without using the one permitted pre-fitting correction.
- Future Category-specific Quality Baselines, including those for Bamboo Shoot and Mushroom, may use looser numerical tolerances than Stage 1 when pre-implementation sensitivity calibration justifies them; the frozen Stage 1 values remain unchanged.
- A Representation Contract Failure must be repaired and rerun against the currently applicable frozen Quality Baseline before it may trigger a rebaseline or count as one of the representation's permitted negative experiments. A Fitting Reproducibility Failure does not invalidate candidate evidence when the corrected fitter regenerates the frozen recipe exactly.
- The corrected Stone fitter reproduced all 24 existing support distances exactly, so the v1 negative result remains valid and activates one Quarantined Rebaseline for `stone-geometry-baseline-v2` without changing the representation or its nonvisual ceilings. The candidate's known metrics are not calibration inputs; if reference-only mild and destructive controls cannot be separated, or the unchanged candidate later fails v2, no second threshold relaxation is allowed under this boundary.
- Under `stone-geometry-baseline-v2`, Stone's uniform-material appearance hard gate retains the v1 thresholds for albedo DeltaE/SSIM, palette, roughness, and metalness. Frozen-lighting RGB remains Geometry-conditioned Appearance Evidence because the accepted support-polyhedron normals alter it even when every independent material measurement is exact.
- The unchanged 24-direction Stone candidate passes `stone-geometry-baseline-v2`, the uniform-material v1 appearance policy, all nonvisual ceilings, and two stable hardware-GPU runs in Chrome, Firefox, and Safari. Stage 1.5 resumes at Patterned Appearance Baseline v2 calibration; Stage 2 remains unauthorized.
- The Stage 1 `single-mesh-quality-baseline-v1` and its two-of-four result remain historical evidence. Stage 1.5 may evaluate a new Umbrella candidate against a separately pre-calibrated Patterned Appearance Baseline v2 whose appearance tolerances may be materially looser, while Umbrella geometry gates and nonvisual budgets remain unchanged.
- Patterned Appearance Baseline v2 may be loosened during reference-only pre-calibration, but a flat canopy, wrong dominant palette, deleted major motif family, materially reduced pattern coverage, and large phase or pattern-scale errors must still fail; no further loosening is permitted after candidate fitting begins.
- `patterned-appearance-baseline-v2` is frozen from two byte-stable reference-only runs with global limits of mean DeltaE <= 6.6967, P90 DeltaE <= 30.8300, mean SSIM >= 0.7287, and worst-view SSIM >= 0.5870 plus flower/leaf/branch Semantic Pattern Recall minima of 0.0451/0.1615/0.5905. Palette centroid and coverage clustering are diagnostic because minor complex-texture palette changes made them discontinuous; flat, wrong-palette, three family-deletion, half-coverage, and large phase/scale controls still fail.
- The geometry-frozen Stage 1.5 Umbrella Bounded Semantic Pattern Program passes its unchanged v1 geometry gate, 2-batch/5,336-triangle golden freeze, complete-source 83/96 scalar audit, all nonvisual budgets, determinism, and Reference Independence, but fails all seven frozen patterned-v2 Chrome appearance metrics: mean/P90 DeltaE 10.1431/56.9890, mean/worst SSIM 0.4189/0.2800, and flower/leaf/branch recall 0.0157/0.0443/0.0100. This is a negative representation-boundary result, not permission to change the baseline.
- The patterned-v2 effort stopped before native Firefox/Safari candidate gates and before Bamboo Shoot/Mushroom pre-calibration. That stopped sequence remains historical; ADR-0032 authorizes a separate human-anchored patterned-v3 decision path without changing its result.
- Firefox and Safari evidence for an otherwise-qualified candidate requires a Native GPU Visual Gate with two stable full-protocol capture runs, recorded browser/OS/Three.js/GPU/color metadata, and an explicit rejection of software rendering. JavaScriptCore and SpiderMonkey structure/bounds signatures do not satisfy this gate.
- Bamboo Shoot and Mushroom receive separate Category-specific Quality Baselines and separate compactness/runtime budgets, calibrated and frozen together during Stage 1.5 before either Stage 2 candidate is fitted. They share the evaluation protocol and cross-browser gates, but a failure or later finding for one cannot change the other's frozen values.
- Every new Category-specific Quality Baseline requires a Calibration Bracket: identity and declared mild perturbations pass, declared destructive controls fail, and a metric that cannot separate the two before candidate fitting is revised or made diagnostic rather than loosened until both pass.
- Bamboo Shoot's Calibration Bracket uses the common scale, pivot, and rotation ladders plus taper, sheath tilt/twist, and axial-spacing ladders at mild/intermediate/severe levels. Its destructive controls delete a major sheath, reduce visible layering, collapse the open separated construction into a closed cone, remove the dominant flared silhouette element, flatten the appearance, corrupt the dominant palette, delete a major motif family, or halve pattern coverage.
- Bamboo Shoot's first Stage 2 representation uses a compact tapered asymmetric core plus separate lateral-sheath and crown-leaf Axial Layer Families with stable semantic identities and preserved open boundaries. The 17 source components inform those families but do not become 17 copied production transforms; a second representation is chosen only from first-candidate failure evidence.
- Mushroom's five closed source components are five complete repeated organic forms with similar topology but materially different height, scale, orientation, and placement. Its Calibration Bracket perturbs per-form size, cap/stem proportion, lean, placement, and cap resolution, while destructive controls delete a visible member or major part, collapse the group to one form, erase inter-form variation, swap dominant scale/layout roles, flatten appearance, corrupt the palette, delete a motif family, or halve pattern coverage.
- Mushroom's first Stage 2 representation uses one shared stem-and-radial-cap generator to produce five Repeated Organic Forms with compact per-form placement, proportion, orientation, lean, and seed controls, stable semantic identities, and no more than two compatible render batches. A second representation is chosen only from first-candidate failure evidence.
- Formal Single Mesh Lab exit may be claimed only when all eight references pass their declared baseline versions and shared gates in the Eight-slot Lab Reference Layout. The historical Stage 1 v1 result remains two of four and is never restated as a retroactive four-of-four pass.
- The reported Umbrella `86/96` scalar pass counted recipe literals but excluded Object Generator and generated-shader constants, so it is incomplete evidence against the declared Object-specific Scalar definition. Stage 1.5 must re-audit every Stage 1 object across its complete production source before relying on scalar headroom or nonvisual acceptance.
- The frozen calibration report is development-only evidence. Its per-view metrics, checksums, source topology diagnostics, and perturbation results are prohibited from the Code-only Production Runtime just like other Ground Truth measurements.
- The frozen Stage 1 certification result is negative: Stone Path and Vase pass every object gate, Stone fails contour and depth-tail geometry gates, and Umbrella passes geometry but fails procedural-appearance gates. The required core-hypothesis result is therefore two of four, and formal Single Mesh Lab exit is not claimed.
- Stage 1's combined production constraints pass independently of its visual failures: the four-object bundle is 7,714 bytes gzip excluding Three.js, sequential warm generation is 1.6 ms p95 on the normative machine, and the replacement runtime has no WASM or runtime textures and renders in the isolated offline audit.
- Stage 1 does not trigger a shared geometry layer or third-party Runtime Kernel. No missing geometry operation recurred across two generators, and all four generators met their compactness and runtime budgets. Umbrella instead triggers a future review of compact procedural appearance and the Code-only Production Runtime boundary for hero patterned objects.
- Stone Path's footprint extrusion, Vase's hollow lathe/procedural gradient, Stone's v2 bounded support polyhedron, and Umbrella's human-approved v3 radial assembly/procedural flower shader are accepted candidates under their declared baseline versions. The Stone loft and Umbrella patterned-v2 result remain historical negative experiments.
- Stone's sole second compact representation candidate is a Bounded Support-plane Polyhedron with at most 24 canonical-direction support distances under the frozen Stone quality and nonvisual budgets; adding more rings, arbitrary source-derived plane normals, or more support directions does not count as another permitted representation.
- A Bounded Semantic Pattern Program is permitted within the Code-only Production Runtime for hero patterned objects. Its object-specific controls count against the existing scalar and bundle budgets, while textures, pixel or sample tables, resolution-scaled paths, and sampled appearance disguised as shader constants remain prohibited.
- `patterned-appearance-baseline-v3` is a Human-anchored Patterned Appearance Baseline. It retains v1 geometry, roughness, metalness, scalar, determinism, Reference Independence, runtime, and bundle gates; exact-position DeltaE, SSIM, palette clustering, and v2 same-position recall are diagnostic.
- Umbrella patterned-v3 hard appearance evidence uses evaluation-space flower/leaf/branch role colors and bounded replacement coverage. The approved Chrome capture has flower/leaf/branch coverage `0.02063/0.03169/0.02287` and total coverage `0.07519`; the hard minima are `0.016/0.023/0.017` and `0.060`, with bounded maxima and role-distance ceilings. Flat, wrong-role-palette, flower deletion, leaf deletion, branch deletion, and half-coverage controls all fail.
- The hash-frozen approved Umbrella candidate passes patterned-v3 plus unchanged geometry and nonvisual gates in Chrome and two stable full-protocol hardware-GPU repetitions in Firefox and Safari. The v2 FAIL remains unchanged; Stage 1.5 continues with pre-calibration for Bamboo Shoot, Mushroom, Blue Hat, and Candle before Stage 2 fitting is authorized.
- `stage-2-category-baselines-v1` freezes separate Bamboo Shoot, Mushroom, Blue Hat, and Candle visual gates and nonvisual budgets from two reference-only runs per object before any candidate is fitted. All mild controls pass and every severe structure/appearance control fails; Candle palette-coverage clustering is diagnostic because it is non-monotone, while its remaining hard appearance metrics still reject wrong-palette and flat controls.
- `single-mesh-stage-1-5-v3-certification-v1` passes every boundary check and authorizes Stage 2 fitting. It preserves historical Stage 1 as `2/4 FAIL`, accepts Stone under geometry-v2 and Umbrella under patterned-v3, and does not claim the formal eight-object exit.
- Stone v2 and Umbrella v3 use Object-scoped Candidate Freezes. Their object-definition hashes preserve the exact recipe-to-generator binding, while additive registrations for later Reconstruction Units no longer create false candidate drift.
- Bamboo Shoot's 64-scalar Axial Layer Family replacement uses a seven-ring tapered core, three bounded sheath families, one hero sheath, and a six-branch crown in two render batches. It passes the unchanged `bamboo-shoot-category-baseline-v1` geometry metrics in Chrome, including mean/worst silhouette IoU `0.93124/0.89656` and edge P95 `5.0991` pixels.
- Bamboo Shoot retains its category-v1 exact-position appearance FAIL as historical evidence. `bamboo-shoot-semantic-category-baseline-v2` instead hard-gates brown-core and green-sheath Semantic Material Role Coverage plus unchanged material and geometry gates; the approved candidate covers `0.96795/0.03205` with reference coverage `0.91683/0.03370`, and delete-sheath, wrong-palette, and flat-single-role controls all reject.
- The hash-frozen Bamboo Shoot candidate passes its semantic appearance v2, nonvisual ceilings, Reference Independence, determinism, Chrome acceptance, and two stable native hardware-GPU repetitions in Firefox and Safari. This resolves only Bamboo Shoot; the eight-object exit remains blocked on Mushroom, Blue Hat, and Candle.
- Immutable Reference Observation is recorded per Normative Observation Host. `macos-chrome-150-swiftshader-llvm-10-0-0` owns the authoritative profile and no other host may rewrite it; `windows-edge-150-swiftshader-subzero` reproduces all seven state digests, the Scene Render Contract, and the frozen camera set exactly, is repeatable to 0.0 on every same-host appearance metric, and differs only by 7 of 576 perceptual-hash bits under the separately versioned `cross-host-observation-contract-v1` bound of 16.
- The Assembled Authored Scene contains 993 renderables and 35 lights. `semantic-coverage-manifest-v2` classifies all of them at 100% by count, world surface area, and Normative Scene Capture pixels: 932 identity-bearing, 16 Horizon Groups, 39 distributed-cover rows, 3 geography surfaces, and 3 justified empty-renderable exclusions. The 672 authored placements correspond one-to-one with the Scene Recipe entities across 45 semantic kinds, and all 32 local lights have Semantic Lights while the 3 global lights belong to the Environment Recipe.
- The offline name-allowlist extractor understated the island: it produced 324 entities by distance-clustering trees and omitted decks, signs, statues, shop stalls, and props entirely. The Scene Recipe is now built from the assembled-scene inventory, one entity per authored placement, so coverage is complete by construction and a new authored family is a blocking failure rather than a silent drop.
- The first honest candidate baseline separates layout from shape. With the Scene Recipe measured from the assembled scene, all 672 entities correspond structurally and the placement contract is exact: anchor, Target AABB Extent, typed orientation, neighbourhood distance, zone occupancy, and overview overlap ordering all report zero error. Surface parity is red — symmetric distance p95 mean 12.04 world units, worst entity 255.19, over-tolerance fraction mean 0.62 — and semantic structure is red with a mean component delta of 4.07. Distant mountains are the worst family at p95 mean 155.74, followed by plazas, bridges, and bamboo.
- `bounded-semantic-terrain-v1` replaces the prototype's 48 sampled coastline radii. Its frozen control budget is 32 coastline curve controls, 40 named analytic landforms, and 4 noise octaves, derived from the reference's own 8 analytic relief anchors plus its authored elevation detail; the fitted program uses 28 controls and 40 landforms and is three orders of magnitude smaller than the 257x257 evidence it was fitted from. Geography evidence is red as expected — height p95 16.26 full, 14.16 interior, 12.49 shore; coastline symmetric p95 15.75; area error 1.97%; land/shore/sea agreement 90.35% — while inlets match 9 of 9, Semantic Sea Level is exactly Y=16 with +Y normal, and the Ocean Appearance Surface covers all six frozen camera frusta.
- The sixteen distant mountain groups are identity-bearing Horizon Groups with bounded multi-form peak and foothill controls measured from the assembled scene, capped at eight forms each. The 360-degree Horizon Profile is computed from triangles rather than vertices, so a coarse procedural ridge and a dense authored mesh are directly comparable; two tessellations of one sphere agree to p95 0.02 rad. The candidate keeps all sixteen groups with exact anchors, extents, and overview overlap ordering, and is red on skyline shape: profile p95 5.67 degrees, worst azimuth 7.16 degrees, depth p95 171 units, visible-angle relative error p95 2.13.
- Fixed scene passes host the Assembled Authored Scene and the real generated candidate in one browser context, so all six frozen cameras are pixel-aligned by construction and every view and projection matrix reproduces the frozen set exactly, including the native reference framing. Each subject renders through its own materials, lights, and post-processing; the reference's lit RGB comes from its own composer. The sky shell and cloud sprites are excluded from the auxiliary passes because they fill every frame for both subjects and would otherwise report perfect agreement regardless of the island; they remain fully present in the native capture. Per-semantic-group evidence is the primary geometry result, because a global silhouette is dominated by whichever surfaces fill the frame.
- The recorded fixed-camera baseline is red as expected: group silhouette IoU mean 0.388 with worst group `paths` at 0 on the north oblique, group depth p95 mean 42.3 world units with worst `horizon` at 291.8, group world-normal p95 mean 110.6 degrees with worst `plazas` at 180, semantic agreement mean 0.866 with worst camera 0.148, and appearance mean DeltaE 15.41 with worst camera 36.65. Per-group appearance is worst for vegetation at 50.6 and best for the horizon at 16.5.
