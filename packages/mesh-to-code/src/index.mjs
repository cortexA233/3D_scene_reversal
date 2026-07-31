export {
  DEFAULT_BASELINE_STAGE,
  emitFromManifest,
  runPipeline,
} from "./kernel/run.mjs";
export { combineAggregates, reverseUnit } from "./kernel/reverse-unit.mjs";
export { composeOperatorProgram } from "./kernel/compose-operators.mjs";
export {
  admitAuthoredOperator,
  checkOperatorContract,
  createContractOperator,
  getOperator,
  hasOperator,
  listOperators,
  OPERATOR_LIBRARY_VERSION as OPERATOR_LIBRARY,
  PROFILE_LATHE,
  publishedOperatorEvidence,
} from "./operators/library.mjs";
export {
  chooseLatheResolution,
  extractAxialProfile,
  latheTriangleCount,
  RING_LADDER,
  SEGMENT_LADDER,
} from "./fitting/profile.mjs";
export {
  fitPart,
  geometryObjective,
  L1_EPSILON,
  L1_ITERATION_CAP,
} from "./fitting/fit.mjs";
export { auditScalars, UNIVERSAL_ALGORITHM_VALUES } from "./audit/scalar-audit.mjs";
export * from "./budget/index.mjs";
export * from "./baseline/index.mjs";
export { artifactPaths } from "./kernel/paths.mjs";
export { EXIT, EXIT_NAMES } from "./kernel/exit-codes.mjs";
export { assignTier, notEvaluatedAxis, TIERS } from "./kernel/tier.mjs";
export {
  assertValidManifest,
  buildStructureManifest,
  serializeManifest,
  verifyManifestHash,
} from "./kernel/manifest.mjs";
export { mechanicalEvidence, weldedConnectedComponents } from "./kernel/decompose.mjs";
export { composeProgram, registerComposer } from "./kernel/compose.mjs";
export { createMockDecider, MOCK_POLICIES } from "./decider/mock.mjs";
export { DECISION_POINTS, responseSchemaFor } from "./protocol/decision-points.mjs";
export { loadSchema, SCHEMA_DIRECTORY } from "./protocol/schemas.mjs";
export { runContractAudit, CONTRACT_CONSTRAINTS } from "./audit/contract-audit.mjs";
export { findAssetDependencies } from "./audit/asset-freedom.mjs";
export { generateFixtureObj, listFixtureKinds } from "./fixtures/generate.mjs";
export { ingestMeshFile, IngestionError, supportedExtensions } from "./ingest/index.mjs";
export {
  createMesh,
  meshBounds,
  meshSurfaceArea,
  toReconstructionFrame,
} from "./geometry/mesh.mjs";
export { canonicalHash, canonicalize, stableStringify } from "./util/canonical-json.mjs";
export { validate, formatFailures } from "./util/schema.mjs";
export { KERNEL_VERSION, OPERATOR_LIBRARY_VERSION } from "./version.mjs";
