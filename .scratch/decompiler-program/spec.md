# Autonomous Object Decompiler

Status: ready-for-agent

Decision source: [docs/decompiler-program-decision-brief.md](../../docs/decompiler-program-decision-brief.md)

## Problem Statement

Producing one Procedural Replacement currently costs a human: choosing the representation, authoring
the Object Generator, setting the compactness budget, writing the perturbation manifest, and — for
five of the eight accepted units — personally anchoring a reachable acceptance threshold. That cost
is roughly constant per object, so reconstructing the full island is bounded by human authoring
throughput rather than by evidence throughput. The eight generators total roughly 1,500 lines of
object-specific code with nothing shared between them, so the ninth object is no cheaper than the
first.

Separately, no reusable artifact came out of Stage 2. The knowledge of how to reverse a lathe-like
form or a repeated organic group exists only as prose in ADRs and as private functions inside
individual generator files, so it cannot be applied to a new mesh without a human re-deriving it.

## Solution

An Autonomous Object Decompiler: a standalone, harness-neutral command that takes one mesh file and
emits a Code-only Three.js Procedural Replacement plus reproducible evidence and a machine-enforced
Reconstruction Tier, with no human choosing the representation and no human authoring the generator.

The deterministic kernel owns the loop, the budget, the gates, and every numeric decision. An
external decider — any agent, or a shipped mock — answers four discrete Decision Points through a
file-based suspend-and-resume protocol. Structure comes from composing Contract Operators drawn from
a project-owned Operator Library seeded by the eight existing generators; authoring a new operator
unlocks only after a library-only beam search has produced a measured geometry-gate failure, and the
authored operator is admitted to the library for reuse.

Human threshold anchoring is replaced by a Budget Proxy — a reference-derived construct rebuilt at
the unit's declared budget — so acceptance thresholds stay reference-only and freeze before fitting.

Below-threshold results still emit code, marked; only contract violations withhold it.

## Test seams

One new seam, chosen because every stage of the pipeline is reachable through it:

```
mesh-reverse run --input <fixture> --decider mock --out <dir>
```

Assertions are made on the emitted artifact directory, the Structure Manifest, the evidence
document, and the exit code. Reachable through this single seam: tier assignment, contract hard
blocks, budget-formula outputs, Decision Point schema conformance, suspend-and-resume equivalence,
multi-unit split and composition, and the classified failure taxonomy.

Reused seams, no new surface:

- Metric and analysis modules that migrate into the package carry their existing tests unchanged
  (`visual-metrics.test.mjs`, `mesh-analysis.test.mjs` and peers).
- The three Decompiler Program phase certifications follow the established `run-*.mjs` plus `--check` plus frozen JSON
  report plus `check:*` script pattern.

Deliberately not a test: CPU-rasterizer versus browser divergence, and wall-clock cost. Both are
Phase A calibration evidence produced by an acceptance script with a declared tolerance, on the same
footing as `run-quality-calibration.mjs`. Asserting on them would produce a test that drifts with
hardware.

## Fixed Contracts

- Contract constraints hard-block emission: non-zero asset dependency, non-determinism, unexecutable
  code, global complexity ceiling exceeded, multi-scale material inconsistency. Every visual-fidelity
  measurement and the per-unit compactness budget only set the Reconstruction Tier.
- Reconstruction Tier and all evidence are development-only and read at build time. No Procedural
  Replacement exports its own certification.
- Only `accepted` units are admitted to the formal Reference-layout Delivery.
- Quality Baselines freeze before fitting, derived from reference-side perturbation manifests and a
  Budget Proxy at the declared budget. A metric that cannot separate declared mild perturbations from
  declared destructive controls becomes diagnostic; it is never loosened until both pass.
- The Complexity Budget Formula is published, frozen before Phase B, applied identically to every
  unit, and bounded by a global ceiling that no unit may exceed for any reason.
- The decider's output is confined to the Structure Manifest, which is hash-frozen. Everything
  downstream of the manifest reproduces bit-for-bit. A from-scratch rerun does not promise the same
  manifest, but the full decision trace is recorded.
- A decider may influence where the search goes. It may never influence what passes.
- New code may only enter as a Contract Operator: pure, deterministic, declared parameter signature
  and scalar count, asset-free, and countable by the complete-source scalar audit. One-off
  object-specific generator source is not a permitted output.
- Appearance is solved analytically from resolution-independent reference statistics, never by
  iterative search. Development-only tooling may sample reference textures; retained values must be
  resolution-independent and must pass the multi-scale material consistency gate.
- L1 reuses the existing metric functions and thresholds unchanged, on identically shaped buffers.
  Metrics are not reimplemented for any backend.
- Dependency direction is one-way: `3d_pcg_reversal` depends on the package, never the reverse.
- The package contains no `.glb`, no image, and no report. Test fixtures are generated from code at
  test time.
- `three` is a peer dependency. No dependency may require native compilation.
- `SKILL.md` names no harness-specific tool or mechanism. Every Decision Point publishes numeric
  evidence; imagery is strictly optional so a text-only decider can still answer.
- Frozen Stage 1, Stage 1.5, and Stage 2 results, baselines, and reports are never rewritten or
  restated. The eight hand-authored generators are the regression corpus and the Operator Library
  seed, not material to be replaced.
- No file that participates in an Object-scoped Candidate Freeze hash surface may be modified,
  including the eight Object Generators, their recipes and definitions, and the shared generation
  kernel they import. The Operator Library is new code seeded by reading them.
- The repository's dependency manifest and lockfile are themselves frozen candidate files, so the
  package is not a workspace of this repository. It is a sibling directory with its own manifest and
  its own lockfile, installed and tested independently, and referenced from repository-side scripts by
  relative path. This keeps the root lockfile byte-identical and makes the package independently
  installable from the first commit rather than at extraction time.

## Implementation Decisions

### Package boundary

A standalone Node package under `packages/`, publishable independently from day one: its own
manifest, version, and `mesh-reverse` binary; generic measurement algorithms migrate in while
object-specific baselines such as `evaluateQualityGate(objectId, …)` stay in this repository; corpora
and baseline configuration are injected as parameters rather than resolved from repository-relative
paths.

One authoritative `SKILL.md` plus JSON schemas form the agent-facing contract. Harness manifests for
Claude Code and Codex are thin parallel adapters over it; both are viable because the package ships
one or two skills, so the single-path constraint on Codex manifests does not bite. Deleting every
adapter must leave the package fully usable, and CI proves it by running the full pipeline with the
mock decider in an environment with no agent harness installed.

The main line phase-switches at the Phase C exit: development stays in this repository until then,
after which the subdirectory is extracted with its history and the standalone repository becomes the
main line.

### Kernel modules

Ingestion accepts glTF/GLB through the existing `@gltf-transform` and Draco path, plus OBJ, PLY, and
STL. Materials and UVs are optional; when absent, appearance degrades to flat material roles and the
unit is marked. Object framing reuses the existing Reconstruction Frame rule. A `list` command
enumerates candidate selectors with triangle count, bounds, and material count.

Mechanical decomposition produces recomputable candidate groupings only — welded connected
components, material groups, shape-descriptor clusters, symmetry orbits and repetition tracks, axial
and radial arrangement detection, and separation ratio. It never decides the semantic grouping.

The complexity gate pre-estimates total budget from the Complexity Budget Formula and assigns
`full`, `coarse`, or `rejected` with a split recommendation. Actual consumption is monitored and
downgrades `full` to `coarse` rather than failing.

Baseline generation builds the reference-side perturbation manifest generically, runs the Calibration
Bracket to decide metric eligibility, constructs the Budget Proxy at the declared budget to bound
reachability, and freezes the resulting baseline before any candidate is fitted.

Fitting runs three tiers. L0 analytic measurements drive coarse search. L1 is a project-owned
pure-JavaScript triangle rasterizer emitting silhouette, depth, and normal buffers in the shape the
existing metric functions already accept; it uses progressive resolution, caches reference-side
buffers, and rasterizes beam candidates in parallel with `worker_threads`. L2 is the existing native
cross-browser gate, under a hard cap on passes.

Appearance solving clusters reference surface albedo into material roles with centroid and coverage,
derives spatial statistics — autocorrelation length, spectral bandwidth, anisotropy, UV periodicity —
and uses those statistics to select and parameterize an appearance operator.

Emission produces a recipe plus a composition importing the Operator Library by default, and an
esbuild-treeshaken self-contained single file on request. Multi-unit inputs additionally emit a
composition module that returns units to their original placement.

Auditing runs the contract checks, the complete-source scalar audit, and the package-content audit
before a tier is assigned.

### Search and decision protocol

Beam search over structure candidates: K mutually dissimilar candidates per round, R rounds, a
per-candidate fitting iteration cap, and at most a small fixed number of L2 passes. Constants are
calibrated on the regression corpus and frozen before Phase B. Structural diversity is preferred to
re-iteration because agent scaffolding is known to raise executable rate without raising conditioned
shape quality.

Four Decision Points: unit division, semantic grouping, structure proposal, and operator authoring.
The kernel writes a pending-decision document containing the mechanical evidence, the allowed
response schema, and optional imagery paths, then exits with a distinguishable code. The decider
writes a decision document. Resuming continues from the frozen prior state. A schema-invalid decision
is rejected without advancing the loop.

Termination is bounded by hard round and wall-clock budgets, by early stop when the best score
improves by less than a declared epsilon for a declared number of consecutive rounds, and by
automatic tier downgrade. Failure output is classified: missing operator, insufficient budget,
appearance statistics matched no operator, or decomposition failure.

The mock decider ships with the package rather than living in tests, because it serves three roles:
deterministic test driver, harness-neutrality prover in CI, and the batch baseline answering what a
simplest-structure policy achieves.

### Operator Library

Seeded from the eight hand-authored generators by reading them, not by refactoring them. Candidate
operators visible in the existing code include profile lathe, shell profile offset, footprint
extrusion, bounded support-plane polyhedron, axial layer family, repeated-form instancing, sweep
along a Catmull–Rom curve, radial panel subdivision, axial gradient vertex colour, and band-limited
value-noise mottling.

The eight generators are not modified to consume the library. Their Object-scoped Candidate Freezes
bind the shared generation kernel as part of the hash surface, so moving code into a shared operator
would change the frozen candidate hashes and force re-certification of accepted evidence. The
Operator Library is therefore new code carrying the same algorithms, and the resulting duplication is
accepted as a bounded one-time cost — the eight generators do not grow further. Each seeded operator
must reproduce its source generator's geometric behaviour on a synthetic fixture, which is what
proves the algorithm transferred correctly without touching the frozen originals.

Admission of a newly authored operator requires the recorded coverage failure that unlocked it, plus
conformance to the Contract Operator checks.

## Testing Decisions

A good test here asserts on externally observable output of the single seam — emitted files, manifest
and evidence content, exit codes — and never on intermediate structure, chosen operator names, or
fitted parameter values, because those are exactly what the pipeline is permitted to change as the
Operator Library grows. A test that pins a chosen operator would fail every time the library
improves.

Prior art to follow: `test/visual-metrics.test.mjs` for synthetic-input module testing,
`test/calibration-contract.test.mjs` and `test/stage2-precalibration-contract.test.mjs` for frozen
contract shape, `test/object-scalar-audit.test.mjs` for audit behaviour, `test/static-audit.test.mjs`
for asset-free enforcement, and `test/replacement-boundary.test.mjs` for reference independence.

Fixtures are generated from code at test time, because the package must contain no binary assets. The
generator must cover at minimum: a lathe-able profile solid, a two-component separated input, a
five-instance repeated group, an input carrying distinct material roles, an input whose complexity
exceeds the `coarse` threshold, and a malformed input with non-triangle primitives.

This is a real coverage limit and is recorded as such: pathologies of authored assets — degenerate
triangles, overlapping UVs, mirrored transforms, unusual index layouts — cannot be synthesised
convincingly and are covered only by the regression and held-out corpora in Stages 3b and 3c, not by
unit tests.

Negative-path coverage is required for each contract hard block, driven by a mock decider variant
that deliberately returns a violating operator, so that the withheld-emission path is exercised rather
than assumed.

## Acceptance

Phase A: the kernel recomputes the eight regression units' published measurements; CPU-rasterizer
versus browser geometry divergence is quantified and a tolerance declared; measured wall-clock per
fitting iteration and per unit is published against a declared budget; the held-out corpus is frozen
by name; Complexity Budget Formula coefficients are frozen; the full pipeline runs with the mock
decider in an environment with no agent harness installed; the package installs from a pack into a
clean directory and runs.

Phase B: every one of the eight regression units reaches a Reconstruction Tier at least as good as
its hand-authored result under its existing frozen baseline version. Operator extraction leaves every
existing generator test passing unchanged.

Phase C: zero contract violations across the held-out corpus, plus the pre-frozen `accepted` count
threshold. The threshold is fixed before the corpus is run.

Pipeline success rate is a descriptive statistic and is never used to adjust a candidate acceptance
threshold.

## Out of Scope

- Any promise that an arbitrary mesh reaches the `accepted` tier.
- Scene-level semantic understanding; the input is geometry, not a room.
- Image-to-3D or inverse graphics; ground-truth meshes are available and are not discarded.
- New CSG, SDF, WASM, general modeling DSL, or third-party Runtime Kernel authorisation.
- A neural model as a hard acceptance gate.
- GPU rasterization backends, in any form, in this scope.
- Terrain, village structures, layout, scatter, wildlife, interaction, animation, or LOD.
- Replacing the eight hand-authored generators or the certified eight-slot delivery.
- Rewriting or restating any frozen Stage 1, Stage 1.5, or Stage 2 result.

## Further Notes

The single largest risk is not automation quality. It is that the CPU rasterizer and the browser
disagree by more than the fitting loop's discrimination margin, in which case the inner loop is
optimising an unproven ruler and every downstream result is suspect. Phase A exists primarily to
close that question, and the divergence tolerance plus wall-clock measurement is its real deliverable.

Second: appearance statistics may not discriminate operators. Irregular mottling and fine panelling
can present similar autocorrelation signatures. This surfaces first on Blue Hat and Candle in Stage
3b, which is deliberate — they are the two units whose appearance already required semantic role
gating.

Third: the Operator Library cold-starts. Early units will trigger operator authoring almost every
time, so the Phase C success rate will sit below the steady state the library eventually reaches.
This is expected and must not be read as a pipeline failure.

Fourth: automatic unit division has no geometric ground truth — five separated mushroom forms are one
unit while a table and a cup are two, and geometry alone cannot tell them apart. The mitigation is
that geometry is reproduced either way and only semantic quality degrades, which is why misgrouping
is designed to be survivable rather than prevented.

Fifth: the Complexity Budget Formula is calibrated on eight points. Extrapolation risk is high and
the global ceiling is the only backstop.
