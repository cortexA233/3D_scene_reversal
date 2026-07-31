# Autonomous Object Decompiler Decision Brief

> Decision cycle date: 2026-07-31
> Predecessor: [single-mesh-stage-1-5-stage-2-decisions.md](./single-mesh-stage-1-5-stage-2-decisions.md)
> Background research: [mesh-to-program-technical-routes.md](./mesh-to-program-technical-routes.md),
> [infinigen-research.md](./infinigen-research.md),
> [procedural-3d-scene-reversal-research.md](./procedural-3d-scene-reversal-research.md)

## Objective

Build an Autonomous Object Decompiler: given one input mesh file, produce a Code-only Three.js
Procedural Replacement with no 3D asset dependency, together with reproducible acceptance evidence
and a machine-enforced Reconstruction Tier — with no human choosing the representation and no human
authoring the generator.

This brief records decisions only. It authorises no implementation.

## Entry state

`single-mesh-stage-2-eight-object-certification-v2` reports `PASS under versioned category-specific
baselines (8/8)`. All eight Procedural Replacements are hash-frozen with Chrome acceptance and two
stable native hardware-GPU repetitions in Firefox and Safari, delivered in the single
`/stage-1-5-scene/` route. Historical Stage 1 remains `2/4 FAIL` and no full-island result is claimed.

What Stage 2 automated: geometric measurement, reference-pass capture, visual and nonvisual metrics,
Calibration Brackets, cross-browser gates, and one fitter (`tools/development/fit-stone-supports.mjs`).

What Stage 2 did **not** automate, and what the Decompiler Program must therefore replace:

| Stage 2 human judgement | Decompiler Program mechanism |
| --- | --- |
| Choosing the procedural representation | Decision Point 3, beam search over Contract Operator compositions |
| Authoring the generator (~1,500 lines across eight objects) | Operator composition; authoring only under a measured coverage failure |
| Setting per-object budgets (Bamboo 64 / Mushroom 96 scalars) | Complexity Budget Formula, coefficients back-calibrated on the eight units |
| Writing per-object perturbation manifests | Generic perturbation-manifest generator |
| Anchoring reachable thresholds (five of eight units) | Budget Proxy ([DECOMP-0002](./adr/decompiler/0002-anchor-reachability-with-a-budget-proxy-instead-of-a-human-exemplar.md)) |
| Judging that a metric is unfit as a hard gate | Calibration Bracket eligibility rule, executed by script |
| Inspecting a texture to classify mottling versus banding | Spatial statistics: autocorrelation length, spectral bandwidth, anisotropy, UV periodicity |
| Reading 17 components as 3 families + 1 hero + 1 crown | Decision Point 2 |

## Invariants carried forward unchanged

- Code-only Production Runtime: no textures, images, serialized geometry, material assets, or sampled
  derivatives, and no sampled appearance disguised as shader constants.
- Deterministic Generation, Reference Independence, and the complete-source Object-specific Scalar
  audit ([ADR-0023](./adr/0023-audit-object-specific-scalars-across-complete-production-source.md)).
- Separate geometry and appearance gates
  ([ADR-0004](./adr/0004-separate-geometry-and-appearance-gates.md)).
- Quality Baselines freeze before candidate fitting
  ([ADR-0010](./adr/0010-calibrate-quality-baselines-without-replacements.md)); every new baseline
  requires a Calibration Bracket.
- Native GPU Visual Gate for formal acceptance
  ([ADR-0019](./adr/0019-require-native-cross-browser-gpu-visual-gates.md)).
- Development-only evidence stays out of the Production Runtime
  ([ADR-0013](./adr/0013-retain-generators-and-gates-discard-analysis-artifacts.md)).
- No new CSG, SDF, WASM, general modeling DSL, or third-party Runtime Kernel authorisation.
- Frozen Stage 1, Stage 1.5, and Stage 2 results are never rewritten or restated.

## Locked decisions

### Boundary and scope

1. **Automation boundary.** Structure is invented automatically inside the bounded Operator Library.
   Continuous parameters belong to deterministic numerical fitting.
   [DECOMP-0001](./adr/decompiler/0001-invent-structure-automatically-inside-a-bounded-operator-library.md)
   supersedes [ADR-0003](./adr/0003-human-guided-scene-decompiler-workflow.md) for the automated path
   only; the human-guided **Scene Decompiler Workflow** term is retained unchanged for the frozen
   Stage 1–2 evidence, and **Autonomous Object Decompiler** is the new term.
2. **Escape hatch.** A library-only beam search runs first. New operator authoring unlocks only when
   the best library-only composition fails that unit's geometry gate. Authored code must satisfy the
   Contract Operator definition; one-off object-specific generator source is not a permitted output.
3. **Meaning of "general".** Zero hand-written generator for a new object — not "any mesh passes".
   Hard metrics are measured only on the held-out corpus. Out-of-domain inputs must produce an
   explicit tier or a classified rejection, never silent garbage.
4. **Corpus.** The held-out corpus is drawn from `island-village.glb` and the 22 unused
   `gt_designer/assets/*.glb`, extracted once and frozen by name at the end of Phase A. The eight
   existing units become the regression corpus; their recipes and generators are known to the
   pipeline, so they prove tooling correctness and never generalisation.

### Acceptance

5. **Threshold anchoring.** Budget Proxy replaces the human-anchored exemplar
   ([DECOMP-0002](./adr/decompiler/0002-anchor-reachability-with-a-budget-proxy-instead-of-a-human-exemplar.md)).
   Metric eligibility is decided by the Calibration Bracket rule executed by script: a metric that
   cannot separate declared mild perturbations from declared destructive controls becomes diagnostic
   rather than being loosened.
6. **Budget derivation.** The Complexity Budget Formula maps reference-side complexity — connected
   component count, symmetry-reduced independent part count, material role count, contour curvature
   complexity — to per-unit scalar, triangle, draw-call, geometry-memory, recipe-size, gzip-delta,
   and warm-generation budgets, under a global ceiling that may never be exceeded. Coefficients are
   back-calibrated on the eight regression units and frozen before Phase B.
7. **Tiering.** Contract constraints hard-block output; quality constraints only set the tier
   ([DECOMP-0003](./adr/decompiler/0003-separate-contract-hard-gates-from-marked-quality-tiers.md)).

   | Tier | Condition | Code emitted | Admitted to Reference-layout Delivery |
   | --- | --- | ---: | ---: |
   | `accepted` | all hard gates pass | yes | yes |
   | `below-gate` | contracts pass, visual fidelity short | yes, marked, per-axis diagnosis | no |
   | `coarse` | complexity tier exceeded, conservative fast path | yes, marked | no |
   | `rejected` | contract violation | no, diagnosis only | no |

   Contract constraints are: non-zero asset dependency, non-determinism, unexecutable code, global
   ceiling exceeded, and multi-scale material inconsistency. Tier lives in development-only evidence
   and is read at build time; no Procedural Replacement exports its own certification.

### Pipeline

8. **Feedback stack.** Three tiers
   ([DECOMP-0004](./adr/decompiler/0004-fit-against-a-three-tier-feedback-stack.md)): L0 analytic measurements,
   L1 project-owned pure-JavaScript triangle rasterizer feeding the existing metric functions,
   L2 the native cross-browser gate under a hard cap on passes. L1 uses progressive resolution —
   few views at low resolution for coarse search, the full twelve-view `CAPTURE_SIZE` protocol only
   for final scoring — caches reference-side buffers, and rasterizes beam candidates in parallel with
   `worker_threads`. GPU backends are rejected: pixel readback is slower than the CPU path, GPU-side
   metrics would require a GLSL reimplementation and an equivalence calibration, and native GL
   bindings violate the zero-native-dependency rule.
9. **Appearance.** Solved analytically, never by iterative search, because a Bounded Semantic Pattern
   Program executes as a shader and cannot descend to L1. Development-only texture sampling derives
   material roles (centroid, coverage) and spatial statistics (autocorrelation length, spectral
   bandwidth, anisotropy, UV periodicity); those statistics select and parameterize an appearance
   operator. Retained values must be resolution-independent
   ([ADR-0008](./adr/0008-retain-only-resolution-independent-measurements.md)); the existing
   multi-scale material consistency check guards against smuggling sampled data.
10. **Decomposition.** The mechanical layer produces recomputable candidates — welded connected
    components, material groups, shape-descriptor clusters, symmetry orbits and repetition tracks,
    axial and radial arrangement detection, and separation ratio. A Decision Point selects the
    semantic grouping. "Is this one object?" is the outermost level of that same decision, on the same
    evidence; there is no purely geometric criterion for it, which is why misgrouping must be
    survivable rather than prevented.
11. **Search shape.** Beam search, K≈3 mutually dissimilar structure candidates per round, R≈3
    rounds, with a per-candidate fitting iteration cap and L2 passes ≤3. Numbers are calibrated on the
    regression corpus. Rationale: 3DCodeBench measured that agent scaffolding raises executable rate
    without raising conditioned shape quality, so structural diversity pays and re-iterating one
    structure does not.
12. **Multi-unit inputs.** Split automatically, reverse each unit through the full pipeline with its
    own budget, gates, and tier, and emit a composition module that returns them to their original
    placement. Repeated units share one generator, so splitting improves compactness.
13. **Complexity gate.** The Complexity Budget Formula pre-estimates the total budget: within ceiling
    → `full`; ceiling to K× ceiling → `coarse`; beyond → `rejected` with a split recommendation. Actual
    consumption is monitored during the run and downgrades `full` to `coarse` rather than failing.
14. **Loop termination.** Hard round and wall-clock budgets, early stop when the best score improves
    by less than ε for K consecutive rounds, automatic downgrade, and a classified failure output:
    missing operator, insufficient budget, appearance statistics matched no operator, or decomposition
    failure.

### Interfaces

15. **Input contract.** glTF/GLB (reusing the existing `@gltf-transform` and Draco path) plus
    OBJ/PLY/STL. Materials and UVs are optional; when absent, appearance degrades to flat material
    roles and the unit is marked. Object framing reuses the existing Reconstruction Frame rule. A
    `list` command enumerates candidate selectors.
16. **Output form.** Dual: by default a recipe plus a composition importing the Operator Library;
    `--inline` produces an esbuild-treeshaken self-contained single file. Runtime output is the
    recipe, the generator, and any authored operators; the Structure Manifest, evidence, and preview
    page are development-only, and the preview page is emitted only under `--preview`.
17. **Non-determinism boundary.** The external decider's output is confined to the Structure Manifest,
    which is hash-frozen; everything downstream of the manifest must reproduce bit-for-bit. A
    from-scratch rerun does not promise the same manifest, but the full decision trace — model
    identity, prompt version, candidate history, per-round measurements — is recorded. A judge may
    decide where to search; it may never decide what passes.
18. **Loop control.** File-based suspend-and-resume: the driver writes `pending-decision.json` and
    exits, the decider writes `decision.json`, `--resume` continues. This is forced by harness
    neutrality — running a command and reading or writing a file are the only capabilities common to
    every harness.

### Distribution

19. **Package boundary.** `packages/mesh-to-code` with `bin: mesh-reverse`, one authoritative
    `SKILL.md` plus JSON schemas, and thin parallel harness adapters
    ([DECOMP-0005](./adr/decompiler/0005-ship-the-decompiler-as-a-harness-neutral-package.md)). Dependencies run
    one way: `3d_pcg_reversal → mesh-to-code`. Generic measurement algorithms move into the package;
    object-specific baselines stay in this repository. `three` is a peer dependency; no dependency may
    require native compilation.
20. **Neutrality checks.** `SKILL.md` names no harness-specific tool or mechanism; every Decision
    Point publishes numeric evidence with imagery strictly optional; CI runs the full pipeline with a
    mock decider in an environment with no agent harness installed.
21. **Release.** A standalone publishable package: npm from the subdirectory, and native Claude Code
    and Codex plugin manifests — both viable because the package ships one or two skills, so the
    single-path constraint on Codex manifests does not bite. Package contents must contain no `.glb`,
    no image, and no report; this audit reuses the `tools/acceptance/static-audit.mjs` approach.
22. **Main line.** Phase switch at the Phase C exit. Development stays in this repository until then;
    `git filter-repo` then extracts the subdirectory with its history and the standalone repository
    becomes the main line, with this repository retaining only corpora, baselines, the eight
    hand-authored generators, and the gallery.
23. **Display route.** Decompiler Program output is shown in a new N-slot gallery route with its own layout
    module, reproducing the existing normalization, bottom-center alignment, and camera conventions
    rather than generalising the existing layout in place. The eight-slot layout modules participate
    in the eight-object certification's frozen surface, so they are not modified; the formal
    Reference-layout Delivery is untouched and continues to admit only `accepted` units.

## Staged exit

| Stage | Content | Exit evidence |
| --- | --- | --- |
| **3a** | Deterministic kernel, mock decider, no LLM | Kernel recomputes the eight units' published measurements; CPU-rasterizer versus browser geometry divergence is quantified and a tolerance is declared; measured wall-clock per fitting iteration and per unit is published against a declared budget; held-out corpus frozen by name; Complexity Budget Formula coefficients frozen |
| **3b** | Decider integrated, regression corpus | Every one of the eight units reaches a tier at least as good as its hand-authored result, under its existing frozen baseline version |
| **3c** | Held-out corpus | Zero contract violations (hard) plus the pre-frozen `accepted` count threshold |

The Phase C threshold is fixed before the held-out corpus is run. Pipeline success rate is a
descriptive statistic and is never used to adjust a candidate acceptance threshold.

## Explicit non-goals

- No implementation in this decision cycle.
- No change to Stage 1, Stage 1.5, or Stage 2 results, baselines, or reports.
- No promise that an arbitrary mesh reaches `accepted`.
- No scene-level semantic understanding; the input is geometry, not a room.
- No image-to-3D or inverse graphics path; ground-truth meshes are available and must not be
  discarded.
- No new CSG, SDF, WASM, general modeling DSL, or third-party Runtime Kernel authorisation.
- No neural model as a hard acceptance gate.
- No terrain, layout, scatter, or full-island planning.

## Known risks

1. **CPU rasterizer is not the GPU.** L1 and L2 geometry metrics will diverge. Phase A must quantify
   the divergence and declare a tolerance; an unquantified inner loop optimises an unproven ruler.
2. **Appearance statistics may not discriminate operators.** Irregular mottling and fine panelling can
   present similar autocorrelation signatures. This is the appearance path's primary failure mode and
   will surface first on Blue Hat and Candle in Phase B.
3. **The Complexity Budget Formula is calibrated on eight points.** Extrapolation risk is high; the
   global ceiling is the only backstop.
4. **Operator Library cold start.** Early units will trigger operator authoring almost every time; the
   library needs tens of objects to converge, so the Phase C success rate will be below steady state.
5. **Automatic unit division has no geometric ground truth.** Five separated mushroom forms are one
   unit while a table and a cup are two. The mitigation is that geometry is reproduced either way and
   only semantic quality degrades.

## `/to-spec` handoff requirements

The next specification may decompose this brief into implementation and acceptance operations, but it
must preserve the decisions above. In particular it must specify:

- the Contract Operator signature, purity and determinism checks, and scalar-counting rule;
- the initial Operator Library contents extracted from the eight hand-authored generators, and the
  admission procedure for authored operators;
- the Structure Manifest schema and its hash-binding surface;
- the `pending-decision.json` and `decision.json` schemas for all four Decision Points, with numeric
  evidence required and imagery optional;
- the Complexity Budget Formula and its frozen coefficients, plus the global ceiling;
- the generic perturbation-manifest generator and the Budget Proxy construction procedure;
- the Calibration Bracket eligibility rule as executable policy;
- the CPU rasterizer contract and the Phase A divergence tolerance;
- the appearance statistic set and the mapping from statistics to appearance operators;
- tier definitions, the build-time tier enforcement point, and failing-exit behaviour for every
  contract gate;
- the three harness-neutrality checks as CI jobs;
- the package layout, dependency direction check, and package-content audit;
- the three certification report schemas.

Numeric thresholds are calibration outputs, not open product decisions. None may be invented from
candidate performance.

## Decision records

- [DECOMP-0001](./adr/decompiler/0001-invent-structure-automatically-inside-a-bounded-operator-library.md) — bounded
  automatic structure invention, superseding ADR-0003 for the automated path;
- [DECOMP-0002](./adr/decompiler/0002-anchor-reachability-with-a-budget-proxy-instead-of-a-human-exemplar.md) —
  Budget Proxy replaces human-anchored baselines;
- [DECOMP-0003](./adr/decompiler/0003-separate-contract-hard-gates-from-marked-quality-tiers.md) — contract hard
  gates versus marked quality tiers;
- [DECOMP-0004](./adr/decompiler/0004-fit-against-a-three-tier-feedback-stack.md) — three-tier feedback and the CPU
  rasterizer;
- [DECOMP-0005](./adr/decompiler/0005-ship-the-decompiler-as-a-harness-neutral-package.md) — harness-neutral package
  boundary and release path.
