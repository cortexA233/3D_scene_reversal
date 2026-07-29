# Procedural Scene Reversal

This context describes the reconstruction of an authored 3D scene as a compact, semantic, deterministic program while preserving the authored scene as measurable ground truth.

## Language

**Authored Reference**:
An original artist-created scene or object retained as ground truth for measurement and comparison, but excluded from the delivered runtime.
_Avoid_: Source asset, production asset

**Semantic Measurement**:
A compact value derived from an Authored Reference that names a generator-relevant property and whose representation size is independent of source mesh, texture, or sampling resolution.
_Avoid_: Extracted mesh data, compressed vertex data, baked sample array

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

**Human-anchored Compact Geometry Baseline**:
A separately versioned, explicitly candidate-informed geometry baseline that names a human-approved, hash-frozen compact procedural candidate as its positive exemplar while requiring all declared reference-side destructive controls to remain rejected by the combined gate; it never rewrites the earlier candidate-independent result.
_Avoid_: Quiet threshold reduction, post-fit category-v1 edit, universal geometry discount

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
- Mushroom's hash-frozen five-form candidate uses 88 Object-specific Scalars, one shared Catmull–Rom stem/bell-cap generator, 2 render batches, and a warm generation p95 below 1 ms. Its unchanged category-v1 result remains a geometry FAIL at mean/worst silhouette IoU `0.83110/0.77453`.
- `mushroom-compact-geometry-baseline-v2` is a Human-anchored Compact Geometry Baseline authorized after the v1 result. It retains the category-v1 bounds limits, versionizes the candidate-informed silhouette/depth limits, and still rejects every pre-existing Stage 2 reference-side destructive geometry control. `mushroom-semantic-category-baseline-v2` hard-gates measured cap `[78,23,16]` and stem `[98,91,75]` roles; cap deletion, stem deletion, and wrong-palette variants reject.
- The Object-scoped Candidate Freeze for Mushroom binds commit `a91fc67`, its object sources, compact geometry baseline, semantic role baseline, and damage variants; v1/v2 reports remain separate versioned evidence. The candidate passes Chrome plus two stable full-protocol native hardware-GPU repetitions in Firefox and Safari. Blue Hat and Candle still block formal 8/8 exit.
