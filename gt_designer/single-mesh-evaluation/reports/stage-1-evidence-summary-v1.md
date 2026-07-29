# Stage 1 evidence summary v1

Certification result: **FAIL**.

The strict four-object hypothesis is not supported: 2 of 4 Stage 1 objects passed every frozen hard gate. Stone fails frozen geometry thresholds; Umbrella passes geometry and nonvisual gates but fails frozen procedural-appearance thresholds. Strong aggregate performance does not compensate for either failure.

| Object | Overall | Geometry | Appearance | Mean IoU | Depth P95 | Mean Delta E 00 | Mean SSIM |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| stone-path | PASS | PASS | PASS | 0.9999 | 0.0000 | 0.01 | 1.000 |
| stone | FAIL | FAIL | not evaluated | 0.9546 | 0.0916 | 3.48 | 0.886 |
| vase | PASS | PASS | PASS | 0.9946 | 0.0066 | 5.69 | 0.925 |
| umbrella | FAIL | PASS | FAIL | 0.9879 | 0.0459 | 9.99 | 0.451 |

Aggregate gates:

- Combined production payload: 7,714 / 40,960 gzip bytes, Three.js excluded — PASS.
- Sequential warm generation p95: 1.600 / 25 ms — PASS.
- Runtime texture count: 0; WASM detected: false — PASS.
- Isolated offline production render: PASS.
- Chrome byte determinism plus JavaScriptCore/SpiderMonkey structural and bounds evidence: PASS.
- Firefox/Safari GPU visual-tolerance rerun: not-run-after-normative-hard-gate-failure; skipped after normative object gates failed and therefore not evidence of a passing stage.

Retained evidence:

- Accepted production candidates: Stone Path shallow extrusion and Vase hollow lathe/procedural gradient.
- Negative experimental generators: Stone compact loft and Umbrella radial assembly/procedural flower shader.
- Retained infrastructure: Reconstruction Unit contract, registry, deterministic RNG, fixed-view Evaluation Harness, frozen Quality Baseline, nonvisual budgets, static audits, cross-engine signatures, isolated offline render, and stage certification runner.
- No production WASM, CSG, SDF, authored models, authored pixels, or new runtime dependency was introduced.

Architecture conclusion:

No geometry-library trigger was met: the completed generators did not duplicate a missing Boolean/SDF/CSG operation, and all compactness/runtime budgets passed. Umbrella instead exposes a procedural-appearance expressiveness limit under the current no-authored-pixels and 96-scalar boundary. That boundary and the meaning of exact-ish for hero textured props must be reviewed before treating full-island reversal as de-risked.

Formal Single Mesh Lab exit is not claimed. It still requires six of eight references including Bamboo Shoot and Mushroom, after a new decision/specification cycle prompted by these failures.
