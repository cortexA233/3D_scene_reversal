# 10 — Stage 1 hypothesis certification

**What to build:** Run and package the complete Stage 1 evidence for Stone Path, Stone, Vase, and Umbrella as one reproducible acceptance operation. The outcome must state whether the four-object result supports the compact human-guided Scene Decompiler Workflow hypothesis and identify evidence-triggered architectural questions without beginning Stage 2 or full-island planning.

**Blocked by:** 09 — Umbrella end-to-end reconstruction.

**Status:** resolved

## Comments

Certification started with two accepted objects (Stone Path and Vase) and two frozen negative object results (Stone geometry and Umbrella appearance). The stage result will remain strict: aggregate performance cannot compensate for either object failure.

- [x] Run every frozen geometry, appearance, compactness, performance, determinism, and Reference Independence hard gate for all four Stage 1 Reconstruction Units.
- [x] Fail the stage when any object fails any hard gate; a stronger metric cannot compensate for a failed metric elsewhere.
- [x] Verify the combined minified production payload is no more than 40 KB gzip excluding the separately reported Three.js dependency.
- [x] Verify sequential warm generation of all four objects is no more than 25 ms on the normative benchmark machine.
- [x] Verify the combined replacement runtime contains no WASM and no runtime texture bytes.
- [x] Verify the production replacement set builds and renders with Authored References unavailable, network access blocked, and browser cache empty.
- [ ] Run normative-browser byte-level deterministic checks and supported Chrome, Firefox, and Safari structural/bounds/visual-tolerance checks.
- [x] Produce a versioned machine-readable stage report plus a concise human-readable evidence summary with per-object and aggregate results and links to diagnostic captures.
- [x] State whether all four representative classes passed and therefore support the core hypothesis; do not claim formal Single Mesh Lab exit, which still requires Bamboo Shoot and Mushroom.
- [x] Report whether at least two generators duplicated the same missing operation, exceeded compact budgets, or required mesh-like retained data so the later architecture review has concrete evidence.
- [x] Record the retained generators, shared helpers, Evaluation Harness, Quality Baseline, and audits separately from disposable extraction and fitting artifacts.
- [x] Do not create Stage 2, terrain/path/layout/scatter, or complete-island implementation work as part of this ticket.

## Answer

The strict Stage 1 certification resolves with a negative result: Stone Path and Vase pass every frozen gate, while Stone fails frozen contour/depth-tail geometry gates and Umbrella fails frozen procedural-appearance gates. The required four-of-four result is therefore `2/4`, so the compact human-guided Scene Decompiler Workflow hypothesis is not supported across all four representative classes and formal Single Mesh Lab exit is not claimed.

The negative result is not caused by production budgets or Reference Independence. The combined replacement bundle is 7,714 bytes gzip excluding Three.js, sequential warm generation is 1.6 ms p95, runtime texture count is zero, WASM is absent, and all four generators pass isolated offline rendering plus Chrome byte determinism and JavaScriptCore/SpiderMonkey structural and bounds checks. Firefox and Safari GPU visual-tolerance reruns were not performed after the normative Chrome object hard gates had already made a passing certification impossible; this remains explicitly missing evidence rather than an implied cross-browser pass.

No general geometry layer or third-party Runtime Kernel trigger was met. None of the four generators repeated the same missing geometry operation, every generator stayed within its compactness/runtime budget, and neither failing case required Boolean, CSG, SDF, or WASM to reach its current result. Umbrella instead supplies evidence that compact procedural appearance is the unresolved boundary: both generated vertex colors and a compact flower/leaf shader failed the authored visual identity without retaining prohibited pixels or sampled lookup data.

The retained implementation consists of the four object recipes/generators, Reconstruction Unit contract and registry, deterministic RNG, fixed-view Evaluation Harness, frozen Quality Baseline, static and runtime audits, cross-engine signatures, offline production build, and the reproducible stage certification operation. Ground-truth extraction, captures, fitting history, and reports remain development-only. Machine-readable evidence is in `gt_designer/single-mesh-evaluation/reports/stage-1-certification-v1.json`; the human summary is `gt_designer/single-mesh-evaluation/reports/stage-1-evidence-summary-v1.md`.

The next specification cycle must review Stone's compact irregular-volume representation and the Exact-ish/code-only boundary for hero patterned objects before extending the experiment. It must also pre-calibrate Bamboo Shoot and Mushroom before any Stage 2 implementation. This ticket creates no Stage 2 or full-island work.
