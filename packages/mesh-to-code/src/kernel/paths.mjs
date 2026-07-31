import path from "node:path";

/**
 * The artifact directory separates runtime output from development-only
 * evidence, because measurement artifacts are prohibited from the Code-only
 * Production Runtime. Only `runtime/` is a delivery candidate.
 */
export function artifactPaths(outDirectory) {
  const root = path.resolve(outDirectory);
  const runtime = path.join(root, "runtime");
  const evidence = path.join(root, "evidence");
  const state = path.join(root, "state");
  return {
    root,
    runtime,
    evidence,
    state,
    recipe: path.join(runtime, "recipe.js"),
    generator: path.join(runtime, "generator.js"),
    inlineGenerator: path.join(runtime, "generator.inline.js"),
    structureManifest: path.join(evidence, "structure-manifest.json"),
    evidenceDocument: path.join(evidence, "evidence.json"),
    decisionTrace: path.join(evidence, "decision-trace.json"),
    runState: path.join(state, "run-state.json"),
    pendingDecision: path.join(state, "pending-decision.json"),
    decision: path.join(state, "decision.json"),
  };
}
