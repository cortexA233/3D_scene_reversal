---
status: accepted
---

# Freeze the Stage 1 Quality Baseline v1 without a correction

The geometry, appearance, and common thresholds declared for Stone Path, Stone, Vase, and Umbrella are frozen as `single-mesh-quality-baseline-v1`. Calibration under Three.js 0.170.0 and the normative headless Chrome 150 SwiftShader path passed 29 checks covering byte-stable repeated Authored Reference captures, identity-copy gates, ordered scale, pivot, rotation, color, radial-resolution, and component-deletion sensitivity, and required diagnostics. No mathematical or threshold correction was needed, so the calibration correction count is zero.

The machine-readable calibration report is retained as development-only evidence and is excluded from the Production Runtime. A future threshold change cannot be justified by a Procedural Replacement failure; it requires an explicit re-baselining decision, rerunning every affected calibration, and superseding this ADR.
