/**
 * Scene Parity Gate Stack.
 *
 * Four independently blocking layers — structural correspondence, world-space
 * geometry, fixed-camera geometry, and native appearance — each with its own
 * frozen thresholds and its own aggregate and worst-case evidence.
 *
 * There is deliberately no weighted overall score. A layer cannot be rescued by
 * another layer's success, a large easy region cannot stand in for a small
 * identity-bearing entity, and a favourable camera cannot stand in for the
 * opposing view. Native appearance is not even evaluated until the geometry
 * layers pass, because a material result over the wrong shape means nothing.
 *
 * This module only reads. It never changes a threshold, a Scene Recipe, a
 * generator, the reference, or the candidate.
 */

export const GATE_STACK_SCHEMA = "scene-parity-gate-stack-v1";

export const GATE_LAYERS = Object.freeze([
  "structuralCorrespondence",
  "worldGeometry",
  "fixedCameraGeometry",
  "nativeAppearance",
]);

/** Layers that must pass before native appearance can support final parity. */
const GEOMETRY_LAYERS = Object.freeze([
  "structuralCorrespondence",
  "worldGeometry",
  "fixedCameraGeometry",
]);

export const EVIDENCE_FAMILIES = Object.freeze({
  coverage: "semantic-coverage-manifest-v2",
  correspondence: "scene-correspondence-v1",
  geography: "geography-evidence-v1",
  horizon: "horizon-comparison-v1",
  passes: "scene-pass-evidence-v1",
});

function readPath(source, dottedPath) {
  return dottedPath
    .split(".")
    .reduce((value, key) => (value === null || value === undefined ? value : value[key]), source);
}

/**
 * One measured value against one frozen threshold. `direction` says which way
 * is good, so a maximum-style limit and a minimum-style limit read the same.
 */
function checkMetric(evidence, definition) {
  const value = readPath(evidence, definition.path);
  if (value === null || value === undefined || Number.isNaN(value)) {
    return {
      name: definition.name,
      scope: definition.scope,
      value: null,
      threshold: definition.threshold,
      direction: definition.direction,
      passed: false,
      missing: true,
    };
  }
  const passed =
    definition.direction === "atMost" ? value <= definition.threshold : value >= definition.threshold;
  return {
    name: definition.name,
    scope: definition.scope,
    value,
    threshold: definition.threshold,
    direction: definition.direction,
    passed,
    missing: false,
  };
}

function evaluateLayer(name, evidence, definitions) {
  // An empty layer is an uncalibrated layer. Letting it pass vacuously would
  // let the stack certify a subject nothing has actually been measured against.
  if (!Array.isArray(definitions) || definitions.length === 0) {
    return {
      layer: name,
      evaluated: false,
      passed: false,
      metrics: [],
      failures: [],
      reason: "no frozen thresholds are calibrated for this layer, so it cannot pass",
    };
  }
  const metrics = definitions.map((definition) => checkMetric(evidence, definition));
  const failures = metrics.filter((metric) => !metric.passed);
  return {
    layer: name,
    evaluated: true,
    passed: failures.length === 0,
    metrics,
    failures: failures.map((metric) =>
      metric.missing
        ? `${metric.name}: evidence is missing`
        : `${metric.name}: ${metric.value} is not ${
            metric.direction === "atMost" ? "<=" : ">="
          } ${metric.threshold}`,
    ),
  };
}

/**
 * Infrastructure and protocol integrity. These failures mean the run itself is
 * not trustworthy and are reported separately from candidate quality, so a
 * broken harness is never mistaken for a bad island — or the reverse.
 */
function evaluateInfrastructure(evidence) {
  const failures = [];
  for (const [family, expectedSchema] of Object.entries(EVIDENCE_FAMILIES)) {
    const report = evidence[family];
    if (!report) {
      failures.push(`${family}: evidence family is missing`);
      continue;
    }
    if (report.schemaVersion !== expectedSchema) {
      failures.push(
        `${family}: schema ${report.schemaVersion} is not the expected ${expectedSchema}`,
      );
    }
  }
  if (evidence.correspondence?.adapterIntegrity?.passed === false) {
    failures.push(
      "candidate adapter applied a transient correction, so its observation is not evidence",
    );
  }
  if (evidence.coverage?.blocking?.visibleUnclassifiedCount > 0) {
    failures.push(
      `${evidence.coverage.blocking.visibleUnclassifiedCount} visible reference renderables are unclassified`,
    );
  }
  for (const failure of evidence.protocolFailures ?? []) failures.push(failure);
  return { passed: failures.length === 0, failures };
}

/**
 * A diagnostic summary for tracking iteration. It is explicitly not
 * authoritative and no gate decision reads it.
 */
function trendIndex(layers) {
  const ratios = Object.values(layers)
    .filter((layer) => layer.evaluated)
    .map((layer) => {
      const total = layer.metrics.length;
      const passed = layer.metrics.filter((metric) => metric.passed).length;
      return total === 0 ? 1 : passed / total;
    });
  return {
    authoritative: false,
    note: "diagnostic only; no gate decision reads this value",
    value:
      ratios.length === 0
        ? null
        : Number((ratios.reduce((sum, value) => sum + value, 0) / ratios.length).toFixed(4)),
  };
}

export function evaluateSceneParityGateStack({ evidence, baseline }) {
  if (baseline?.schemaVersion !== "scene-quality-baseline-v1") {
    throw new Error("the gate stack requires a frozen scene-quality-baseline-v1");
  }
  if (!Object.isFrozen(baseline)) {
    throw new Error("the baseline must be immutable input to acceptance");
  }

  const infrastructure = evaluateInfrastructure(evidence);
  const layers = {};

  layers.structuralCorrespondence = evaluateLayer(
    "structuralCorrespondence",
    evidence,
    baseline.layers.structuralCorrespondence,
  );
  layers.worldGeometry = evaluateLayer("worldGeometry", evidence, baseline.layers.worldGeometry);
  layers.fixedCameraGeometry = evaluateLayer(
    "fixedCameraGeometry",
    evidence,
    baseline.layers.fixedCameraGeometry,
  );

  const geometryPassed = GEOMETRY_LAYERS.every((layer) => layers[layer].passed);
  layers.nativeAppearance = geometryPassed
    ? evaluateLayer("nativeAppearance", evidence, baseline.layers.nativeAppearance)
    : {
        layer: "nativeAppearance",
        evaluated: false,
        passed: false,
        metrics: [],
        failures: [],
        blockedBy: GEOMETRY_LAYERS.filter((layer) => !layers[layer].passed),
        reason:
          "native appearance is not evaluated until every geometry layer passes, because a material result over the wrong shape is not evidence",
      };

  const candidatePassed = GATE_LAYERS.every((layer) => layers[layer].passed);
  return {
    schemaVersion: GATE_STACK_SCHEMA,
    baselineVersion: baseline.version,
    infrastructure,
    layers,
    candidate: {
      passed: candidatePassed,
      failedLayers: GATE_LAYERS.filter((layer) => !layers[layer].passed),
    },
    trendIndex: trendIndex(layers),
    exitStatus: !infrastructure.passed
      ? "infrastructure-failure"
      : candidatePassed
        ? "pass"
        : "candidate-failure",
  };
}
