const SCENARIOS = Object.freeze([
  {
    id: "mild-position-negative",
    classification: "should-pass",
    category: "motif-position",
    mutation: { translatePixels: [-0.25, 0] },
  },
  {
    id: "mild-position-positive",
    classification: "should-pass",
    category: "motif-position",
    mutation: { translatePixels: [0.25, 0] },
  },
  {
    id: "mild-phase-negative",
    classification: "should-pass",
    category: "pattern-phase",
    mutation: { rotationDegrees: -0.1 },
  },
  {
    id: "mild-phase-positive",
    classification: "should-pass",
    category: "pattern-phase",
    mutation: { rotationDegrees: 0.1 },
  },
  {
    id: "mild-scale-down",
    classification: "should-pass",
    category: "pattern-scale",
    mutation: { scale: 0.998 },
  },
  {
    id: "mild-scale-up",
    classification: "should-pass",
    category: "pattern-scale",
    mutation: { scale: 1.002 },
  },
  {
    id: "mild-layout-negative",
    classification: "should-pass",
    category: "motif-layout",
    mutation: { shearX: -0.001 },
  },
  {
    id: "mild-layout-positive",
    classification: "should-pass",
    category: "motif-layout",
    mutation: { shearX: 0.001 },
  },
  {
    id: "mild-palette-warm",
    classification: "should-pass",
    category: "dominant-palette",
    mutation: { rgbFactors: [1.02, 1, 0.98] },
  },
  {
    id: "mild-palette-cool",
    classification: "should-pass",
    category: "dominant-palette",
    mutation: { rgbFactors: [0.98, 1, 1.02] },
  },
  {
    id: "reject-flat-canopy",
    classification: "must-reject",
    category: "flat-appearance",
    mutation: { pixelOperation: "flat-dominant-color" },
  },
  {
    id: "reject-wrong-dominant-palette",
    classification: "must-reject",
    category: "wrong-dominant-palette",
    mutation: { pixelOperation: "rotate-rgb-channels" },
  },
  {
    id: "reject-delete-flower-family",
    classification: "must-reject",
    category: "major-motif-deletion",
    mutation: { pixelOperation: "delete-flower-family" },
  },
  {
    id: "reject-delete-leaf-family",
    classification: "must-reject",
    category: "major-motif-deletion",
    mutation: { pixelOperation: "delete-leaf-family" },
  },
  {
    id: "reject-delete-branch-family",
    classification: "must-reject",
    category: "major-motif-deletion",
    mutation: { pixelOperation: "delete-branch-family" },
  },
  {
    id: "reject-half-pattern-coverage",
    classification: "must-reject",
    category: "pattern-coverage",
    mutation: { pixelOperation: "delete-half-pattern" },
  },
  {
    id: "reject-large-negative-phase",
    classification: "must-reject",
    category: "pattern-phase",
    mutation: { rotationDegrees: -24 },
  },
  {
    id: "reject-large-positive-phase",
    classification: "must-reject",
    category: "pattern-phase",
    mutation: { rotationDegrees: 24 },
  },
  {
    id: "reject-large-scale-down",
    classification: "must-reject",
    category: "pattern-scale",
    mutation: { scale: 0.65 },
  },
  {
    id: "reject-large-scale-up",
    classification: "must-reject",
    category: "pattern-scale",
    mutation: { scale: 1.45 },
  },
]);

const COLOR_REJECTS = Object.freeze([
  "reject-flat-canopy",
  "reject-wrong-dominant-palette",
]);
const SPATIAL_REJECTS = Object.freeze([
  "reject-half-pattern-coverage",
  "reject-large-negative-phase",
  "reject-large-positive-phase",
  "reject-large-scale-down",
  "reject-large-scale-up",
]);
const PALETTE_REJECTS = Object.freeze([
  ...COLOR_REJECTS,
  "reject-delete-flower-family",
  "reject-delete-leaf-family",
  "reject-delete-branch-family",
  "reject-half-pattern-coverage",
]);

const METRICS = Object.freeze([
  {
    path: "appearance.meanDeltaE00",
    operator: "<=",
    direction: "maximum",
    applicableMustRejectScenarioIds: COLOR_REJECTS,
    minimumAbsoluteGuard: 0.1,
    classification: "hard",
  },
  {
    path: "appearance.p90DeltaE00",
    operator: "<=",
    direction: "maximum",
    applicableMustRejectScenarioIds: COLOR_REJECTS,
    minimumAbsoluteGuard: 0.1,
    classification: "hard",
  },
  {
    path: "appearance.meanMaskedSsim",
    operator: ">=",
    direction: "minimum",
    applicableMustRejectScenarioIds: SPATIAL_REJECTS,
    minimumAbsoluteGuard: 0.005,
    classification: "hard",
  },
  {
    path: "appearance.worstViewSsim",
    operator: ">=",
    direction: "minimum",
    applicableMustRejectScenarioIds: SPATIAL_REJECTS,
    minimumAbsoluteGuard: 0.005,
    classification: "hard",
  },
  {
    path: "patterned.flowerRecall",
    operator: ">=",
    direction: "minimum",
    applicableMustRejectScenarioIds: ["reject-delete-flower-family"],
    minimumAbsoluteGuard: 0.01,
    classification: "hard",
  },
  {
    path: "patterned.leafRecall",
    operator: ">=",
    direction: "minimum",
    applicableMustRejectScenarioIds: ["reject-delete-leaf-family"],
    minimumAbsoluteGuard: 0.01,
    classification: "hard",
  },
  {
    path: "patterned.branchRecall",
    operator: ">=",
    direction: "minimum",
    applicableMustRejectScenarioIds: ["reject-delete-branch-family"],
    minimumAbsoluteGuard: 0.01,
    classification: "hard",
  },
  {
    path: "appearance.paletteCentroidDeltaE00",
    operator: "<=",
    direction: "maximum",
    applicableMustRejectScenarioIds: PALETTE_REJECTS,
    minimumAbsoluteGuard: 0.1,
    classification: "diagnostic",
    diagnosticReason:
      "palette clustering is discontinuous under minor complex-texture color changes",
  },
  {
    path: "appearance.paletteCoverageL1",
    operator: "<=",
    direction: "maximum",
    applicableMustRejectScenarioIds: PALETTE_REJECTS,
    minimumAbsoluteGuard: 0.005,
    classification: "diagnostic",
    diagnosticReason:
      "palette clustering is discontinuous under minor complex-texture color changes",
  },
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function atPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

function finiteMetric(evidence, path) {
  const value = atPath(evidence, path);
  return Number.isFinite(value) ? value : null;
}

export function patternedAppearanceV2CalibrationContractDefinition() {
  return {
    schemaVersion: "patterned-appearance-v2-calibration-contract-v1",
    baselineVersion: "patterned-appearance-baseline-v2",
    objectId: "umbrella",
    artifactRole: "development-only-reference-calibration-contract",
    productionUse: "prohibited",
    candidateUse: "prohibited",
    capturePolicy: {
      independentRuns: 2,
      views: 12,
      passes: ["silhouette", "albedo", "lit-rgb"],
      crossRunEvidence: "byte-identical",
    },
    thresholdSelection: {
      strategy: "widest-safe-reference-only",
      guardBandFractionOfSeparation: 0.05,
      shouldPassPolicy: "all scenarios pass the complete hard gate",
      mustRejectPolicy:
        "every scenario fails at least one predeclared applicable hard metric",
      candidateFailuresMayRelaxThresholds: false,
    },
    calibrationPolicy: {
      correctionsUsed: 1,
      corrections: [
        {
          id: "reference-perturbation-semantics",
          reason:
            "initial whole-texture transforms overwhelmed mild motif controls and palette clustering was discontinuous",
          resolution:
            "transform motif pixels only; keep palette clustering diagnostic; use measured identity-copy tolerances; add semantic family recall",
          candidateEvidenceUsed: false,
        },
      ],
      frozenAfterPassingRun: true,
    },
    identityTolerance: {
      meanDeltaE00Maximum: 0.002,
      p90DeltaE00Maximum: 0,
      meanMaskedSsimMinimum: 0.9999,
      worstViewSsimMinimum: 0.9998,
      paletteCentroidDeltaE00Maximum: 0.01,
      paletteCoverageL1Maximum: 0.001,
      roughnessAbsoluteErrorMaximum: 0,
      metalnessAbsoluteErrorMaximum: 0,
    },
    materialThresholds: {
      roughnessAbsoluteErrorMaximum: 0.1,
      metalnessAbsoluteErrorMaximum: 0.05,
      source: "unchanged-single-mesh-quality-baseline-v1",
    },
    metrics: clone(METRICS),
    scenarios: clone(SCENARIOS),
    referenceTextureSemantics: {
      source: "Authored Reference base-color texture",
      resolutionUse: "development-only-perturbation",
      productionTransfer: "prohibited",
      motifRegionNormalizedTopLeft: [0.14, 0.22, 0.46, 0.58],
      deletedPixelReplacementSrgb: [132, 128, 78],
    },
  };
}

export function validatePatternedAppearanceV2Contract(contract) {
  const failures = [];
  if (contract.objectId !== "umbrella") failures.push("object-id");
  if (contract.capturePolicy?.independentRuns !== 2) failures.push("run-count");
  const ids = new Set(contract.scenarios?.map(({ id }) => id));
  if (ids.size !== contract.scenarios?.length) failures.push("scenario-ids");
  const shouldPass = contract.scenarios?.filter(
    ({ classification }) => classification === "should-pass",
  );
  const mustReject = contract.scenarios?.filter(
    ({ classification }) => classification === "must-reject",
  );
  if (shouldPass?.length !== 10) failures.push("should-pass-coverage");
  if (mustReject?.length !== 10) failures.push("must-reject-coverage");
  const requiredCategories = [
    "motif-position",
    "pattern-phase",
    "pattern-scale",
    "motif-layout",
    "dominant-palette",
    "flat-appearance",
    "wrong-dominant-palette",
    "major-motif-deletion",
    "pattern-coverage",
  ];
  const categories = new Set(contract.scenarios?.map(({ category }) => category));
  for (const category of requiredCategories) {
    if (!categories.has(category)) failures.push(`category/${category}`);
  }
  const applicable = new Set(
    contract.metrics?.filter(({ classification }) => classification === "hard").flatMap(({ applicableMustRejectScenarioIds }) =>
      applicableMustRejectScenarioIds,
    ),
  );
  for (const scenario of mustReject ?? []) {
    if (!applicable.has(scenario.id)) failures.push(`applicability/${scenario.id}`);
  }
  for (const metric of contract.metrics ?? []) {
    if (!["hard", "diagnostic"].includes(metric.classification)) {
      failures.push(`classification/${metric.path}`);
    }
    if (!["<=", ">="].includes(metric.operator)) failures.push(`operator/${metric.path}`);
    for (const scenarioId of metric.applicableMustRejectScenarioIds ?? []) {
      if (!ids.has(scenarioId)) failures.push(`unknown-scenario/${scenarioId}`);
    }
  }
  return { passed: failures.length === 0, failures };
}

export function validatePatternedAppearanceV2Run({ contract, run }) {
  const failures = [];
  const expectedIds = contract.scenarios.map(({ id }) => id);
  if (run.objectId !== contract.objectId) failures.push("object-id");
  if (run.referenceCaptureChecksums == null) failures.push("reference-checksums");
  if (run.identity?.comparison?.aggregate == null) failures.push("identity");
  if (run.scenarios?.length !== expectedIds.length) failures.push("scenario-count");
  if (run.scenarios?.some((scenario, index) => scenario.id !== expectedIds[index])) {
    failures.push("scenario-order");
  }
  for (const scenario of run.scenarios ?? []) {
    for (const metric of contract.metrics) {
      if (finiteMetric(scenario.aggregate, metric.path) === null) {
        failures.push(`${scenario.id}/${metric.path}`);
      }
    }
  }
  return { passed: failures.length === 0, failures };
}

export function selectPatternedAppearanceV2Thresholds({ contract, runs }) {
  const shouldPassIds = new Set(
    contract.scenarios
      .filter(({ classification }) => classification === "should-pass")
      .map(({ id }) => id),
  );
  const evidenceById = new Map(
    contract.scenarios.map(({ id }) => [
      id,
      runs.map((run) => run.scenarios.find((scenario) => scenario.id === id)),
    ]),
  );
  const hard = [];
  const groupFailures = [];
  for (const metric of contract.metrics.filter(
    ({ classification }) => classification === "hard",
  )) {
    const mildValues = [...shouldPassIds].flatMap((id) =>
      evidenceById.get(id).map((scenario) => finiteMetric(scenario.aggregate, metric.path)),
    );
    const destructiveValues = metric.applicableMustRejectScenarioIds.flatMap((id) =>
      evidenceById.get(id).map((scenario) => finiteMetric(scenario.aggregate, metric.path)),
    );
    const mildBoundary = metric.direction === "maximum"
      ? Math.max(...mildValues)
      : Math.min(...mildValues);
    const destructiveBoundary = metric.direction === "maximum"
      ? Math.min(...destructiveValues)
      : Math.max(...destructiveValues);
    const separation = metric.direction === "maximum"
      ? destructiveBoundary - mildBoundary
      : mildBoundary - destructiveBoundary;
    const guardBand = Math.max(
      metric.minimumAbsoluteGuard,
      separation * contract.thresholdSelection.guardBandFractionOfSeparation,
    );
    const threshold = metric.direction === "maximum"
      ? destructiveBoundary - guardBand
      : destructiveBoundary + guardBand;
    const separated = separation > guardBand && (
      metric.direction === "maximum"
        ? threshold >= mildBoundary
        : threshold <= mildBoundary
    );
    if (!separated) {
      groupFailures.push({
        metric: metric.path,
        mildBoundary,
        destructiveBoundary,
        separation,
        guardBand,
      });
    }
    hard.push({
      path: metric.path,
      operator: metric.operator,
      threshold,
      mildBoundary,
      destructiveBoundary,
      guardBand,
      applicableMustRejectScenarioIds: metric.applicableMustRejectScenarioIds,
      source: "reference-only-widest-safe-selection",
    });
  }
  hard.push(
    {
      path: "appearance.roughnessAbsoluteError",
      operator: "<=",
      threshold: contract.materialThresholds.roughnessAbsoluteErrorMaximum,
      source: contract.materialThresholds.source,
    },
    {
      path: "appearance.metalnessAbsoluteError",
      operator: "<=",
      threshold: contract.materialThresholds.metalnessAbsoluteErrorMaximum,
      source: contract.materialThresholds.source,
    },
  );
  return {
    passed: groupFailures.length === 0,
    strategy: contract.thresholdSelection.strategy,
    hard,
    diagnostic: contract.metrics
      .filter(({ classification }) => classification === "diagnostic")
      .map((metric) => ({
        path: metric.path,
        reason: metric.diagnosticReason,
        source: "reference-only-correction-before-candidate-fitting",
      })),
    groupFailures,
  };
}

export function evaluatePatternedAppearanceV2Gate({ baseline, aggregate }) {
  const failures = [];
  for (const metric of baseline.hard) {
    const actual = finiteMetric(aggregate, metric.path);
    const passed = actual !== null && (
      metric.operator === "<="
        ? actual <= metric.threshold
        : actual >= metric.threshold
    );
    if (!passed) failures.push({ metric: metric.path, operator: metric.operator, threshold: metric.threshold, actual });
  }
  return {
    passed: failures.length === 0,
    failures,
    baselineVersion: baseline.version,
  };
}
