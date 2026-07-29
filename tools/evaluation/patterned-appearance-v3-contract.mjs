const REQUIRED_DESTRUCTIVE_CONTROLS = Object.freeze([
  "flat-canopy",
  "wrong-role-palette",
  "delete-flower-family",
  "delete-leaf-family",
  "delete-branch-family",
  "half-pattern-coverage",
]);

const REQUIRED_DIAGNOSTICS = Object.freeze([
  "appearance.meanDeltaE00",
  "appearance.p90DeltaE00",
  "appearance.meanMaskedSsim",
  "appearance.worstViewSsim",
  "appearance.paletteCentroidDeltaE00",
  "appearance.paletteCoverageL1",
  "patterned.flowerRecall",
  "patterned.leafRecall",
  "patterned.branchRecall",
]);

function atPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

function finiteMetric(evidence, path) {
  const value = atPath(evidence, path);
  return Number.isFinite(value) ? value : null;
}

export function validatePatternedAppearanceV3Baseline(baseline) {
  const failures = [];
  if (baseline?.version !== "patterned-appearance-baseline-v3") {
    failures.push("version");
  }
  if (baseline?.objectId !== "umbrella") failures.push("object-id");
  if (baseline?.anchorPolicy?.candidateIndependent !== false) {
    failures.push("candidate-informed-policy");
  }
  if (baseline?.humanApproval?.decision !== "approved-positive-exemplar") {
    failures.push("human-approval");
  }
  if (!baseline?.positiveExemplars?.some(({ id }) => id === "approved-umbrella-v3")) {
    failures.push("approved-positive-exemplar");
  }
  const controls = new Set(
    baseline?.destructiveControls?.map(({ id }) => id),
  );
  for (const id of REQUIRED_DESTRUCTIVE_CONTROLS) {
    if (!controls.has(id)) failures.push(`destructive-control/${id}`);
  }
  const diagnostics = new Set(
    baseline?.diagnostic?.map(({ path }) => path),
  );
  for (const path of REQUIRED_DIAGNOSTICS) {
    if (!diagnostics.has(path)) failures.push(`diagnostic/${path}`);
  }
  if (!Array.isArray(baseline?.hard) || baseline.hard.length === 0) {
    failures.push("hard-metrics");
  }
  for (const metric of baseline?.hard ?? []) {
    if (![">=", "<="].includes(metric.operator)) {
      failures.push(`operator/${metric.path}`);
    }
    if (!Number.isFinite(metric.threshold)) {
      failures.push(`threshold/${metric.path}`);
    }
    if (metric.path.startsWith("appearance.") && ![
      "appearance.roughnessAbsoluteError",
      "appearance.metalnessAbsoluteError",
    ].includes(metric.path)) {
      failures.push(`pixel-metric-must-be-diagnostic/${metric.path}`);
    }
  }
  return { passed: failures.length === 0, failures };
}

export function evaluatePatternedAppearanceV3Gate({ baseline, aggregate }) {
  const validation = validatePatternedAppearanceV3Baseline(baseline);
  if (!validation.passed) {
    return {
      passed: false,
      failures: validation.failures.map((failure) => ({
        metric: "baseline-contract",
        actual: failure,
      })),
      baselineVersion: baseline?.version ?? null,
    };
  }
  const failures = [];
  for (const metric of baseline.hard) {
    const actual = finiteMetric(aggregate, metric.path);
    const passed = actual !== null && (
      metric.operator === "<="
        ? actual <= metric.threshold
        : actual >= metric.threshold
    );
    if (!passed) {
      failures.push({
        metric: metric.path,
        operator: metric.operator,
        threshold: metric.threshold,
        actual,
      });
    }
  }
  return {
    passed: failures.length === 0,
    failures,
    baselineVersion: baseline.version,
  };
}
