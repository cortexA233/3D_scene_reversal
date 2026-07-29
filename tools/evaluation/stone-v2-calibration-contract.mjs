export const STONE_GEOMETRY_V2_CALIBRATION_CONTRACT_SCHEMA_VERSION =
  "stone-geometry-v2-calibration-contract-v1";
export const STONE_GEOMETRY_BASELINE_V2_VERSION =
  "stone-geometry-baseline-v2";

const scenarios = [
  ["uniform-scale/-0.01", "uniform-scale", "mild", { factor: 0.99 }],
  ["uniform-scale/+0.01", "uniform-scale", "mild", { factor: 1.01 }],
  ["uniform-scale/-0.02", "uniform-scale", "intermediate", { factor: 0.98 }],
  ["uniform-scale/+0.02", "uniform-scale", "intermediate", { factor: 1.02 }],
  ["uniform-scale/-0.05", "uniform-scale", "severe", { factor: 0.95 }, true],
  ["uniform-scale/+0.05", "uniform-scale", "severe", { factor: 1.05 }, true],
  ["pivot-x/0.01", "canonical-pivot-offset", "mild", { offset: 0.01 }],
  ["pivot-x/0.05", "canonical-pivot-offset", "intermediate", { offset: 0.05 }],
  ["pivot-x/0.10", "canonical-pivot-offset", "severe", { offset: 0.1 }, true],
  ["rotation-y/1", "rotation-y", "mild", { degrees: 1 }],
  ["rotation-y/3", "rotation-y", "intermediate", { degrees: 3 }],
  ["rotation-y/5", "rotation-y", "severe", { degrees: 5 }],
  ["anisotropic-x/1.02", "anisotropic-scale", "mild", { xFactor: 1.02 }],
  ["anisotropic-x/1.05", "anisotropic-scale", "intermediate", { xFactor: 1.05 }],
  ["anisotropic-x/1.10", "anisotropic-scale", "severe", { xFactor: 1.1 }, true],
  ["profile-compression/0.05", "profile-compression", "mild", { exponentDelta: 0.05 }],
  ["profile-compression/0.15", "profile-compression", "intermediate", { exponentDelta: 0.15 }],
  ["profile-compression/0.35", "profile-compression", "severe", { exponentDelta: 0.35 }],
  ["profile-compression/0.80", "profile-compression", "destructive", { exponentDelta: 0.8 }, true],
  ["support-hull/24", "support-direction-count", "mild", { directionCount: 24 }],
  ["support-hull/16", "support-direction-count", "intermediate", { directionCount: 16 }],
  ["support-hull/12", "support-direction-count", "severe", { directionCount: 12 }],
  ["support-hull/8", "support-direction-count", "destructive", { directionCount: 8 }, true],
  ["shear-x-by-y/0.02", "shear-x-by-y", "mild", { factor: 0.02 }],
  ["shear-x-by-y/0.06", "shear-x-by-y", "intermediate", { factor: 0.06 }],
  ["shear-x-by-y/0.12", "shear-x-by-y", "destructive", { factor: 0.12 }, true],
  ["substitute/ellipsoid", "structural-substitute", "destructive", { shape: "ellipsoid" }, true],
  ["substitute/box", "structural-substitute", "destructive", { shape: "box" }, true],
  ["squash-y/0.80", "squash-y", "destructive", { yFactor: 0.8 }, true],
].map(([id, family, severity, parameters, mustReject = false]) => ({
  id,
  family,
  severity,
  thresholdRole: severity === "mild" ? "mild-envelope" : "ordering",
  mustReject,
  parameters,
}));

const metrics = [
  {
    path: "geometry.bounds.maxAxisRelativeError",
    operator: "<=",
    repeatabilityAllowance: 0.002,
    group: "bounds",
    destructiveScenarioIds: [
      "uniform-scale/-0.05",
      "uniform-scale/+0.05",
      "anisotropic-x/1.10",
      "squash-y/0.80",
    ],
  },
  {
    path: "geometry.bounds.bottomAnchorErrorCanonical",
    operator: "<=",
    repeatabilityAllowance: 0.002,
    group: "bounds",
    destructiveScenarioIds: ["pivot-x/0.10"],
  },
  {
    path: "geometry.silhouette.meanIou",
    operator: ">=",
    repeatabilityAllowance: 0.002,
    group: "silhouette",
    destructiveScenarioIds: [
      "support-hull/8",
      "substitute/ellipsoid",
      "substitute/box",
    ],
  },
  {
    path: "geometry.silhouette.worstViewIou",
    operator: ">=",
    repeatabilityAllowance: 0.003,
    group: "silhouette",
    destructiveScenarioIds: [
      "support-hull/8",
      "substitute/ellipsoid",
      "substitute/box",
    ],
  },
  {
    path: "geometry.silhouette.meanEdgeDistancePixels",
    operator: "<=",
    repeatabilityAllowance: 0.25,
    group: "silhouette",
    destructiveScenarioIds: [
      "support-hull/8",
      "substitute/ellipsoid",
      "substitute/box",
    ],
  },
  {
    path: "geometry.silhouette.edgeDistanceP95Pixels",
    operator: "<=",
    repeatabilityAllowance: 1,
    group: "silhouette",
    destructiveScenarioIds: [
      "support-hull/8",
      "substitute/ellipsoid",
      "substitute/box",
    ],
  },
  {
    path: "geometry.depth.mae",
    operator: "<=",
    repeatabilityAllowance: 0.002,
    group: "depth",
    destructiveScenarioIds: [
      "profile-compression/0.80",
      "support-hull/8",
      "substitute/ellipsoid",
      "substitute/box",
      "squash-y/0.80",
    ],
  },
  {
    path: "geometry.depth.p95",
    operator: "<=",
    repeatabilityAllowance: 0.005,
    group: "depth",
    destructiveScenarioIds: [
      "profile-compression/0.80",
      "support-hull/8",
      "substitute/ellipsoid",
      "substitute/box",
      "squash-y/0.80",
    ],
  },
];

const contract = {
  schemaVersion: STONE_GEOMETRY_V2_CALIBRATION_CONTRACT_SCHEMA_VERSION,
  baselineVersion: STONE_GEOMETRY_BASELINE_V2_VERSION,
  objectId: "stone",
  artifactRole: "development-only-reference-calibration-contract",
  productionUse: "prohibited",
  inputPolicy: {
    allowed: [
      "Authored Reference geometry",
      "fresh Authored Reference captures",
      "declared reference perturbations",
    ],
    prohibited: [
      "Stone replacement imports",
      "Stone replacement captures",
      "known Stone candidate metrics",
      "candidate-dependent threshold overrides",
    ],
  },
  capturePolicy: {
    independentRuns: 2,
    viewsPerRun: 12,
    geometryPasses: ["silhouette", "linear-depth", "world-normal"],
    requireByteStableIdentityCaptures: true,
  },
  thresholdSelection: {
    strategy: "least-permissive-mild-envelope-plus-fixed-allowance",
    numericPrecisionDigits: 12,
    nonSeparatingAction: "demote-to-diagnostic",
    minimumHardMetricsByGroup: {
      bounds: 2,
      silhouette: 2,
      depth: 1,
    },
  },
  calibrationPolicy: {
    maximumReferenceOnlyCorrectionsBeforeFreeze: 1,
    correctionsUsed: 1,
    correction:
      "After the first reference-only run, narrow each metric's destructive applicability to controls it is designed to detect, add a materially stronger profile-compression destructive control, and accept <=1e-6 identity depth rasterization error. Candidate evidence was not loaded.",
    thresholdsFrozenAfterAcceptedReport: true,
    candidateFailuresMayChangeBaseline: false,
  },
  orderingPolicies: [
    {
      id: "uniform-scale-negative-ordering",
      scenarioIds: ["uniform-scale/-0.01", "uniform-scale/-0.02", "uniform-scale/-0.05"],
      metricPath: "geometry.bounds.maxAxisRelativeError",
      tolerance: 1e-6,
    },
    {
      id: "uniform-scale-positive-ordering",
      scenarioIds: ["uniform-scale/+0.01", "uniform-scale/+0.02", "uniform-scale/+0.05"],
      metricPath: "geometry.bounds.maxAxisRelativeError",
      tolerance: 1e-6,
    },
    {
      id: "pivot-ordering",
      scenarioIds: ["pivot-x/0.01", "pivot-x/0.05", "pivot-x/0.10"],
      metricPath: "geometry.bounds.bottomAnchorErrorCanonical",
      tolerance: 1e-6,
    },
    {
      id: "rotation-ordering",
      scenarioIds: ["rotation-y/1", "rotation-y/3", "rotation-y/5"],
      metricPath: "geometry.silhouette.meanEdgeDistancePixels",
      tolerance: 0.02,
    },
    {
      id: "anisotropic-scale-ordering",
      scenarioIds: ["anisotropic-x/1.02", "anisotropic-x/1.05", "anisotropic-x/1.10"],
      metricPath: "geometry.bounds.maxAxisRelativeError",
      tolerance: 1e-6,
    },
    {
      id: "profile-compression-ordering",
      scenarioIds: [
        "profile-compression/0.05",
        "profile-compression/0.15",
        "profile-compression/0.35",
      ],
      metricPath: "geometry.depth.mae",
      tolerance: 1e-4,
    },
    {
      id: "support-direction-ordering",
      scenarioIds: ["support-hull/24", "support-hull/16", "support-hull/12", "support-hull/8"],
      metricPath: "geometry.silhouette.meanEdgeDistancePixels",
      tolerance: 0.02,
    },
    {
      id: "shear-ordering",
      scenarioIds: ["shear-x-by-y/0.02", "shear-x-by-y/0.06", "shear-x-by-y/0.12"],
      metricPath: "geometry.silhouette.meanEdgeDistancePixels",
      tolerance: 0.02,
    },
  ],
  metrics,
  scenarios,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function get(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function rounded(value, digits) {
  return Number(value.toFixed(digits));
}

export function stoneGeometryV2CalibrationContractDefinition() {
  return clone(contract);
}

export function validateStoneGeometryV2CalibrationContract(value) {
  const failures = [];
  const scenarioIds = new Set((value?.scenarios ?? []).map(({ id }) => id));
  if (
    value?.schemaVersion !==
    STONE_GEOMETRY_V2_CALIBRATION_CONTRACT_SCHEMA_VERSION
  ) failures.push("schema-version");
  if (value?.baselineVersion !== STONE_GEOMETRY_BASELINE_V2_VERSION) {
    failures.push("baseline-version");
  }
  if (
    value?.calibrationPolicy?.correctionsUsed >
      value?.calibrationPolicy?.maximumReferenceOnlyCorrectionsBeforeFreeze ||
    value?.calibrationPolicy?.candidateFailuresMayChangeBaseline !== false
  ) failures.push("calibration-correction-policy");
  if (scenarioIds.size !== value?.scenarios?.length) {
    failures.push("unique-scenario-ids");
  }
  for (const family of [
    "uniform-scale",
    "canonical-pivot-offset",
    "rotation-y",
    "anisotropic-scale",
    "profile-compression",
    "support-direction-count",
    "shear-x-by-y",
  ]) {
    const levels = new Set(
      value.scenarios
        .filter((scenario) => scenario.family === family)
        .map((scenario) => scenario.severity),
    );
    if (!levels.has("mild") || !levels.has("intermediate")) {
      failures.push(`${family}/missing-ladder-level`);
    }
  }
  for (const metric of value?.metrics ?? []) {
    if (!["<=", ">="].includes(metric.operator)) {
      failures.push(`${metric.path}/operator`);
    }
    if (!(metric.repeatabilityAllowance >= 0)) {
      failures.push(`${metric.path}/allowance`);
    }
    if (
      !metric.destructiveScenarioIds?.length ||
      metric.destructiveScenarioIds.some((id) => !scenarioIds.has(id))
    ) {
      failures.push(`${metric.path}/destructive-coverage`);
    }
  }
  for (const policy of value?.orderingPolicies ?? []) {
    if (
      policy.scenarioIds?.length < 3 ||
      policy.scenarioIds.some((id) => !scenarioIds.has(id)) ||
      !value.metrics.some((metric) => metric.path === policy.metricPath)
    ) {
      failures.push(`${policy.id}/invalid-ordering-policy`);
    }
  }
  return { passed: failures.length === 0, failures };
}

export function validateStoneGeometryV2Run({ contract: value, run }) {
  const failures = [];
  if (
    run?.artifactRole !== "development-only-authored-reference-calibration" ||
    run?.objectId !== value.objectId
  ) failures.push({ id: "reference-only-run-identity" });
  const scenarios = new Map(
    (run?.scenarios ?? []).map((scenario) => [scenario.id, scenario]),
  );
  const expectedIds = value.scenarios.map((scenario) => scenario.id);
  if (
    scenarios.size !== expectedIds.length ||
    expectedIds.some((id) => !scenarios.has(id))
  ) failures.push({ id: "complete-scenario-coverage" });
  if (
    JSON.stringify(run?.identity?.baselineCaptureChecksums) !==
    JSON.stringify(run?.identity?.repeatCaptureChecksums)
  ) failures.push({ id: "identity-byte-stability" });
  for (const policy of value.orderingPolicies) {
    const values = policy.scenarioIds.map((id) =>
      get(scenarios.get(id)?.aggregate, policy.metricPath),
    );
    const ordered = values.every(Number.isFinite) && values.every(
      (entry, index) =>
        index === 0 || entry + policy.tolerance >= values[index - 1],
    ) && values.at(-1) > values[0] + policy.tolerance;
    if (!ordered) failures.push({ id: policy.id, values });
  }
  return { passed: failures.length === 0, failures };
}

export function evaluateStoneGeometryV2Gate({ baseline, aggregate }) {
  const failures = baseline.hard.flatMap((metric) => {
    const actual = get(aggregate, metric.path);
    const passed = Number.isFinite(actual) && (
      metric.operator === "<="
        ? actual <= metric.threshold
        : actual >= metric.threshold
    );
    return passed ? [] : [{
      metric: metric.path,
      actual,
      operator: metric.operator,
      threshold: metric.threshold,
    }];
  });
  return {
    baselineVersion: baseline.version ?? baseline.baselineVersion,
    objectId: "stone",
    passed: failures.length === 0,
    failures,
  };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function stoneUniformAppearanceEvidence(perView) {
  if (!Array.isArray(perView) || perView.length === 0) {
    throw new Error("Stone uniform appearance evidence requires per-view records");
  }
  const albedo = perView.map((view) => view.appearance.albedo);
  const litRgb = perView.map((view) => view.appearance.litRgb);
  const palette = perView.map((view) => view.appearance.palette);
  const material = perView.map((view) => view.appearance.material);
  return {
    hard: {
      meanDeltaE00: mean(albedo.map((entry) => entry.meanDeltaE00)),
      p90DeltaE00: Math.max(...albedo.map((entry) => entry.p90DeltaE00)),
      meanMaskedSsim: mean(albedo.map((entry) => entry.maskedSsim)),
      worstViewSsim: Math.min(...albedo.map((entry) => entry.maskedSsim)),
      paletteCentroidDeltaE00: Math.max(
        ...palette.map((entry) => entry.centroidDeltaE00),
      ),
      paletteCoverageL1: Math.max(
        ...palette.map((entry) => entry.coverageL1),
      ),
      roughnessAbsoluteError: Math.max(
        ...material.map((entry) => entry.roughnessAbsoluteError),
      ),
      metalnessAbsoluteError: Math.max(
        ...material.map((entry) => entry.metalnessAbsoluteError),
      ),
      passPolicy:
        "v1 numeric appearance thresholds over albedo, palette, roughness, and metalness",
    },
    diagnostic: {
      evidenceClass: "geometry-conditioned-lit-rgb",
      meanDeltaE00: mean(litRgb.map((entry) => entry.meanDeltaE00)),
      p90DeltaE00: Math.max(...litRgb.map((entry) => entry.p90DeltaE00)),
      meanMaskedSsim: mean(litRgb.map((entry) => entry.maskedSsim)),
      worstViewSsim: Math.min(...litRgb.map((entry) => entry.maskedSsim)),
    },
  };
}

export function selectStoneGeometryV2Thresholds({ contract: value, runs }) {
  const validation = validateStoneGeometryV2CalibrationContract(value);
  if (!validation.passed) {
    throw new Error(`invalid Stone v2 calibration contract: ${validation.failures.join(", ")}`);
  }
  if (runs?.length !== value.capturePolicy.independentRuns) {
    throw new Error("Stone v2 threshold selection requires exactly two independent runs");
  }
  if (
    runs.some(
      (run) =>
        run.artifactRole !== "development-only-authored-reference-calibration" ||
        run.objectId !== value.objectId,
    )
  ) {
    throw new Error("Stone v2 threshold selection accepts Authored Reference calibration runs only");
  }
  const scenariosByRun = runs.map(
    (run) => new Map(run.scenarios.map((scenario) => [scenario.id, scenario])),
  );
  const mildIds = value.scenarios
    .filter((scenario) => scenario.thresholdRole === "mild-envelope")
    .map((scenario) => scenario.id);
  const hard = [];
  const diagnostic = [];
  for (const metric of value.metrics) {
    const mildValues = scenariosByRun.flatMap((scenarios) =>
      mildIds.map((id) => get(scenarios.get(id)?.aggregate, metric.path)),
    );
    if (!mildValues.every(Number.isFinite)) {
      throw new Error(`missing mild evidence for ${metric.path}`);
    }
    const envelope = metric.operator === "<="
      ? Math.max(...mildValues)
      : Math.min(...mildValues);
    const threshold = rounded(
      metric.operator === "<="
        ? envelope + metric.repeatabilityAllowance
        : envelope - metric.repeatabilityAllowance,
      value.thresholdSelection.numericPrecisionDigits,
    );
    const nonSeparating = [];
    for (const scenarioId of metric.destructiveScenarioIds) {
      const values = scenariosByRun.map((scenarios) =>
        get(scenarios.get(scenarioId)?.aggregate, metric.path),
      );
      if (!values.every(Number.isFinite)) {
        throw new Error(`missing destructive evidence for ${metric.path}/${scenarioId}`);
      }
      const rejected = values.every((actual) =>
        metric.operator === "<=" ? actual > threshold : actual < threshold,
      );
      if (!rejected) nonSeparating.push({ scenarioId, values });
    }
    const record = {
      path: metric.path,
      operator: metric.operator,
      threshold,
      mildEnvelope: envelope,
      repeatabilityAllowance: metric.repeatabilityAllowance,
      group: metric.group,
      destructiveScenarioIds: [...metric.destructiveScenarioIds],
    };
    if (nonSeparating.length === 0) hard.push(record);
    else diagnostic.push({ ...record, reason: "non-separating", nonSeparating });
  }
  const groupCounts = Object.fromEntries(
    Object.keys(value.thresholdSelection.minimumHardMetricsByGroup).map(
      (group) => [group, hard.filter((metric) => metric.group === group).length],
    ),
  );
  const groupFailures = Object.entries(
    value.thresholdSelection.minimumHardMetricsByGroup,
  ).filter(([group, minimum]) => groupCounts[group] < minimum);
  return {
    schemaVersion: "stone-geometry-v2-threshold-selection-v1",
    baselineVersion: value.baselineVersion,
    passed: groupFailures.length === 0,
    hard,
    diagnostic,
    groupCounts,
    groupFailures: groupFailures.map(([group, minimum]) => ({
      group,
      minimum,
      actual: groupCounts[group],
    })),
  };
}
