/**
 * The package's measurement surface.
 *
 * Every function here comes from a byte-identical vendored copy of a host
 * repository module, so the fitting loop and the terminal acceptance gates score
 * with one ruler rather than two. See `vendor/README.md`.
 *
 * Object-specific baseline evaluation is deliberately absent. `evaluateQualityGate`,
 * `qualityBaselineDefinition`, and `QUALITY_BASELINE_VERSION` exist in the
 * vendored copy because byte-identity requires it, and they are not re-exported:
 * per-object thresholds and their versions stay in the host repository, which
 * owns them. `OBJECT_SPECIFIC_EXPORTS_WITHHELD` names them so the boundary is
 * checkable rather than a matter of convention.
 *
 * The generic perturbation helpers live in `./perturbations.mjs` instead of here
 * because they need a Three.js namespace, and the kernel's measurement path must
 * stay free of it.
 */

export {
  aggregateAppearanceEvidence,
  aggregateGeometryEvidence,
  aggregateVisualEvidence,
  deltaE00,
  evaluateAppearanceView,
  evaluateGeometryView,
  percentile,
} from "./vendor/tools/evaluation/visual-metrics.mjs";

export {
  comparePointSets,
  evaluateGeometricDiagnostics,
} from "./vendor/tools/evaluation/geometric-diagnostics.mjs";

export { analyzeTriangleMesh } from "./vendor/tools/ground-truth/mesh-analysis.mjs";

export const OBJECT_SPECIFIC_EXPORTS_WITHHELD = Object.freeze([
  "QUALITY_BASELINE_VERSION",
  "qualityBaselineDefinition",
  "evaluateQualityGate",
  "createStoneSupportHull",
  "compressStoneProfile",
  "shearStoneGeometry",
  "createStoneStructuralSubstitute",
]);
