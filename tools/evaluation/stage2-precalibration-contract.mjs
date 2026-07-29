const OBJECT_IDS = Object.freeze([
  "bamboo-shoot",
  "mushroom",
  "blue-hat",
  "candle",
]);

const METRICS = Object.freeze([
  ["geometry.bounds.maxAxisRelativeError", "<=", "geometry"],
  ["geometry.bounds.bottomAnchorErrorCanonical", "<=", "geometry"],
  ["geometry.silhouette.meanIou", ">=", "geometry"],
  ["geometry.silhouette.worstViewIou", ">=", "geometry"],
  ["geometry.silhouette.meanEdgeDistancePixels", "<=", "geometry"],
  ["geometry.silhouette.edgeDistanceP95Pixels", "<=", "geometry"],
  ["geometry.depth.mae", "<=", "geometry"],
  ["geometry.depth.p95", "<=", "geometry"],
  ["appearance.meanDeltaE00", "<=", "appearance"],
  ["appearance.p90DeltaE00", "<=", "appearance"],
  ["appearance.meanMaskedSsim", ">=", "appearance"],
  ["appearance.worstViewSsim", ">=", "appearance"],
  ["appearance.paletteCentroidDeltaE00", "<=", "appearance"],
  ["appearance.paletteCoverageL1", "<=", "appearance"],
]);

export const STAGE_2_OBJECT_BUDGETS = Object.freeze({
  "bamboo-shoot": Object.freeze({
    objectSpecificScalarsMaximum: 64,
    recipeBytesMaximum: 1536,
    gzipBytesMaximum: 6144,
    trianglesMaximum: 1536,
    drawCallsMaximum: 2,
    geometryBytesMaximum: 98304,
    warmP95MillisecondsMaximum: 8,
  }),
  mushroom: Object.freeze({
    objectSpecificScalarsMaximum: 96,
    recipeBytesMaximum: 2048,
    gzipBytesMaximum: 8192,
    trianglesMaximum: 3840,
    drawCallsMaximum: 2,
    geometryBytesMaximum: 196608,
    warmP95MillisecondsMaximum: 10,
  }),
  "blue-hat": Object.freeze({
    objectSpecificScalarsMaximum: 64,
    recipeBytesMaximum: 1536,
    gzipBytesMaximum: 6144,
    trianglesMaximum: 1536,
    drawCallsMaximum: 2,
    geometryBytesMaximum: 98304,
    warmP95MillisecondsMaximum: 8,
  }),
  candle: Object.freeze({
    objectSpecificScalarsMaximum: 96,
    recipeBytesMaximum: 2048,
    gzipBytesMaximum: 8192,
    trianglesMaximum: 2048,
    drawCallsMaximum: 3,
    geometryBytesMaximum: 131072,
    warmP95MillisecondsMaximum: 10,
  }),
});

function atPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function evaluateMetrics(metrics, aggregate) {
  const failures = [];
  for (const metric of metrics) {
    const actual = atPath(aggregate, metric.path);
    const passed = Number.isFinite(actual) && (
      metric.operator === "<="
        ? actual <= metric.threshold
        : actual >= metric.threshold
    );
    if (!passed) failures.push({ ...metric, actual });
  }
  return { passed: failures.length === 0, failures };
}

function selectObjectBaseline(objectId, runs) {
  const hard = [];
  const diagnostic = [];
  for (const [path, operator, domain] of METRICS) {
    const mildValues = runs.flatMap((run) =>
      run.scenarios
        .filter((scenario) =>
          scenario.domain === domain && scenario.classification === "should-pass"
        )
        .map((scenario) => atPath(scenario.comparison.aggregate, path))
    ).filter(Number.isFinite);
    const destructiveValues = runs.flatMap((run) =>
      run.scenarios
        .filter((scenario) =>
          scenario.domain === domain && scenario.classification === "must-reject"
        )
        .map((scenario) => atPath(scenario.comparison.aggregate, path))
    ).filter(Number.isFinite);
    const mildBoundary = operator === "<="
      ? Math.max(...mildValues)
      : Math.min(...mildValues);
    const separatedDestructive = destructiveValues.filter((value) =>
      operator === "<=" ? value > mildBoundary : value < mildBoundary
    );
    const destructiveBoundary = operator === "<="
      ? Math.min(...separatedDestructive)
      : Math.max(...separatedDestructive);
    if (
      mildValues.length === 0 ||
      separatedDestructive.length === 0 ||
      !Number.isFinite(mildBoundary) ||
      !Number.isFinite(destructiveBoundary)
    ) {
      diagnostic.push({
        path,
        domain,
        reason: "reference controls did not produce a monotone separating boundary",
      });
      continue;
    }
    const separation = Math.abs(destructiveBoundary - mildBoundary);
    const threshold = operator === "<="
      ? mildBoundary + separation * 0.25
      : mildBoundary - separation * 0.25;
    hard.push({
      path,
      operator,
      threshold,
      domain,
      mildBoundary,
      destructiveBoundary,
      guardFraction: 0.25,
      source: "two-run-reference-only-calibration-bracket",
    });
  }
  hard.push(
    {
      path: "appearance.roughnessAbsoluteError",
      operator: "<=",
      threshold: 0.1,
      domain: "appearance",
      source: "unchanged-shared-material-gate",
    },
    {
      path: "appearance.metalnessAbsoluteError",
      operator: "<=",
      threshold: 0.05,
      domain: "appearance",
      source: "unchanged-shared-material-gate",
    },
  );
  const failures = [];
  for (const run of runs) {
    if (
      stableJson(run.referenceCaptureChecksums) !==
      stableJson(run.repeatability.captureChecksums)
    ) {
      failures.push({ runIndex: run.runIndex, reason: "repeatability" });
    }
    for (const scenario of run.scenarios) {
      const gate = evaluateMetrics(
        hard.filter((metric) => metric.domain === scenario.domain),
        scenario.comparison.aggregate,
      );
      const expectedPass = scenario.classification === "should-pass";
      if (gate.passed !== expectedPass) {
        failures.push({
          runIndex: run.runIndex,
          scenarioId: scenario.id,
          expected: expectedPass ? "pass" : "reject",
          actual: gate.passed ? "pass" : "reject",
          gateFailures: gate.failures,
        });
      }
    }
  }
  return {
    schemaVersion: "stage-2-category-quality-baseline-v1",
    version: `${objectId}-category-baseline-v1`,
    objectId,
    artifactRole: "development-only-quality-baseline",
    productionUse: "prohibited",
    candidateUse: "prohibited-during-calibration",
    selectionStrategy: "two-run-reference-only-separated-quarter-guard",
    hard,
    diagnostic,
    budget: STAGE_2_OBJECT_BUDGETS[objectId],
    frozen: failures.length === 0,
    calibrationFailures: failures,
  };
}

export function selectStage2CategoryBaselines(runs) {
  const grouped = new Map(OBJECT_IDS.map((id) => [id, []]));
  for (const run of runs) grouped.get(run.objectId)?.push(run);
  const objects = {};
  const failures = [];
  for (const objectId of OBJECT_IDS) {
    const objectRuns = grouped.get(objectId);
    if (objectRuns.length !== 2) {
      failures.push({ objectId, reason: "requires-exactly-two-runs" });
      continue;
    }
    objects[objectId] = selectObjectBaseline(objectId, objectRuns);
    failures.push(...objects[objectId].calibrationFailures.map((failure) => ({
      objectId,
      ...failure,
    })));
  }
  return {
    schemaVersion: "stage-2-category-quality-baselines-v1",
    version: "stage-2-category-baselines-v1",
    artifactRole: "development-only-quality-baseline-set",
    productionUse: "prohibited",
    candidateUse: "prohibited-during-calibration",
    objectIds: [...OBJECT_IDS],
    calibrationPolicy: {
      independentRuns: 2,
      referenceOnly: true,
      candidatesFittedBeforeFreeze: false,
      replacementFailuresMayRelaxThresholds: false,
      inseparableMetrics: "diagnostic",
    },
    objects,
    frozen: failures.length === 0,
    failures,
  };
}

export function evaluateStage2CategoryGate({ baseline, aggregate }) {
  const geometry = evaluateMetrics(
    baseline.hard.filter(({ domain }) => domain === "geometry"),
    aggregate,
  );
  if (!geometry.passed) {
    return {
      baselineVersion: baseline.version,
      objectId: baseline.objectId,
      passed: false,
      failures: geometry.failures,
      geometryGate: geometry,
      appearanceGate: {
        evaluated: false,
        passed: null,
        reason: "geometry-gate-failed",
        failures: [],
      },
    };
  }
  const appearance = evaluateMetrics(
    baseline.hard.filter(({ domain }) => domain === "appearance"),
    aggregate,
  );
  return {
    baselineVersion: baseline.version,
    objectId: baseline.objectId,
    passed: appearance.passed,
    failures: appearance.failures,
    geometryGate: geometry,
    appearanceGate: { evaluated: true, ...appearance },
  };
}
