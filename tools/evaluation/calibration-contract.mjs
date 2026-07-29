import {
  QUALITY_BASELINE_VERSION,
  qualityBaselineDefinition,
} from "./visual-metrics.mjs";

export const QUALITY_CALIBRATION_SCHEMA_VERSION =
  "single-mesh-quality-calibration-v1";

const REQUIRED_OBJECT_IDS = ["stone-path", "stone", "vase", "umbrella"];

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function get(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function ordered(records, selector, tolerance = 1e-9) {
  const values = records.map(selector);
  return (
    values.every(Number.isFinite) &&
    values.every(
      (value, index) => index === 0 || value + tolerance >= values[index - 1],
    ) &&
    values.at(-1) > values[0] + tolerance
  );
}

export function validateQualityCalibration(report) {
  const checks = [];
  const record = (id, passed, detail) => {
    checks.push({ id, passed: Boolean(passed), detail });
  };

  record(
    "schema-version",
    report?.schemaVersion === QUALITY_CALIBRATION_SCHEMA_VERSION,
    report?.schemaVersion,
  );
  record(
    "quality-baseline-version",
    report?.qualityBaseline?.version === QUALITY_BASELINE_VERSION,
    report?.qualityBaseline?.version,
  );
  record(
    "quality-baseline-definition",
    stableJson(report?.qualityBaseline) === stableJson(qualityBaselineDefinition()),
    "report thresholds equal the source-controlled definition",
  );
  record(
    "calibration-correction-budget",
    report?.calibrationPolicy?.correctionsUsed <= 1 &&
      report?.calibrationPolicy?.thresholdsFrozenAfterThisReport === true &&
      report?.calibrationPolicy?.replacementFailuresMayRelaxThresholds === false,
    report?.calibrationPolicy,
  );

  const objects = new Map(
    (report?.objects ?? []).map((object) => [object.objectId, object]),
  );
  record(
    "stage-1-object-coverage",
    REQUIRED_OBJECT_IDS.every((id) => objects.has(id)) &&
      objects.size === REQUIRED_OBJECT_IDS.length,
    [...objects.keys()],
  );

  for (const objectId of REQUIRED_OBJECT_IDS) {
    const object = objects.get(objectId);
    if (!object) continue;
    const baselineChecksums = object.repeatability?.baselineCaptureChecksums;
    const repeatChecksums = object.repeatability?.comparison?.captureChecksums;
    record(
      `${objectId}/repeatability-byte-stable`,
      stableJson(baselineChecksums) === stableJson(repeatChecksums),
      "all five required passes across twelve views",
    );
    record(
      `${objectId}/identity-gate`,
      object.identity?.comparison?.gate?.passed === true,
      object.identity?.comparison?.gate?.failures ?? null,
    );
    record(
      `${objectId}/identity-diagnostics`,
      get(
        object,
        "identity.comparison.diagnostics.pointSetDistance.symmetricHausdorffCanonical",
      ) <= 1e-5 &&
        get(object, "identity.comparison.diagnostics.surfaceArea.relativeError") <=
          1e-5 &&
        get(object, "identity.comparison.diagnostics.volume.relativeError") <=
          1e-5,
      object.identity?.comparison?.diagnostics ?? null,
    );
  }

  const stonePath = objects.get("stone-path");
  const perturbations = stonePath?.perturbations ?? [];
  const byCategory = (category) =>
    perturbations.filter((entry) => entry.category === category);
  for (const sign of [-1, 1]) {
    const scales = byCategory("uniform-scale")
      .filter((entry) => Math.sign(entry.signedValue) === sign)
      .sort((first, second) => first.magnitude - second.magnitude);
    record(
      `scale-${sign < 0 ? "negative" : "positive"}-ordering`,
      scales.length === 3 &&
        ordered(
          scales,
          (entry) =>
            entry.comparison.aggregate.geometry.bounds.maxAxisRelativeError,
        ),
      scales.map((entry) => ({
        value: entry.signedValue,
        boundsError:
          entry.comparison.aggregate.geometry.bounds.maxAxisRelativeError,
      })),
    );
    record(
      `scale-${sign < 0 ? "negative" : "positive"}-five-percent-fails-bounds`,
      scales.at(-1)?.comparison.aggregate.geometry.bounds
        .maxAxisRelativeError > 0.02,
      scales.at(-1)?.comparison.aggregate.geometry.bounds
        .maxAxisRelativeError,
    );
  }

  const pivots = byCategory("canonical-pivot-offset").sort(
    (first, second) => first.magnitude - second.magnitude,
  );
  record(
    "pivot-ordering",
    pivots.length === 3 &&
      ordered(
        pivots,
        (entry) =>
          entry.comparison.aggregate.geometry.bounds.bottomAnchorErrorCanonical,
      ),
    pivots.map((entry) => ({
      magnitude: entry.magnitude,
      bottomAnchorError:
        entry.comparison.aggregate.geometry.bounds.bottomAnchorErrorCanonical,
    })),
  );
  record(
    "pivot-large-offset-fails-anchor",
    pivots.at(-1)?.comparison.aggregate.geometry.bounds
      .bottomAnchorErrorCanonical > 0.02,
    pivots.at(-1)?.comparison.aggregate.geometry.bounds
      .bottomAnchorErrorCanonical,
  );

  const rotations = byCategory("rotation-y").sort(
    (first, second) => first.magnitude - second.magnitude,
  );
  record(
    "rotation-ordering",
    rotations.length === 3 &&
      ordered(
        rotations,
        (entry) =>
          entry.comparison.aggregate.geometry.silhouette
            .meanEdgeDistancePixels,
        0.02,
      ),
    rotations.map((entry) => ({
      degrees: entry.magnitude,
      meanEdgeDistancePixels:
        entry.comparison.aggregate.geometry.silhouette.meanEdgeDistancePixels,
    })),
  );
  record(
    "rotation-exposes-silhouette",
    rotations.at(-1)?.comparison.aggregate.geometry.silhouette.meanIou < 0.999,
    rotations.at(-1)?.comparison.aggregate.geometry.silhouette.meanIou,
  );

  const colors = byCategory("base-color-factor").sort(
    (first, second) => first.magnitude - second.magnitude,
  );
  record(
    "color-ordering",
    colors.length === 3 &&
      ordered(
        colors,
        (entry) => entry.comparison.aggregate.appearance.meanDeltaE00,
        0.01,
      ),
    colors.map((entry) => ({
      factor: entry.linearRgbFactor,
      meanDeltaE00: entry.comparison.aggregate.appearance.meanDeltaE00,
    })),
  );
  record(
    "color-large-difference-fails-appearance",
    colors.at(-1)?.comparison.aggregate.appearance.meanDeltaE00 > 4 ||
      colors.at(-1)?.comparison.aggregate.appearance.meanMaskedSsim < 0.95,
    colors.at(-1)?.comparison.aggregate.appearance,
  );

  const radial = (objects.get("vase")?.perturbations ?? [])
    .filter((entry) => entry.category === "reduced-radial-resolution")
    .sort((first, second) => second.segmentCount - first.segmentCount);
  record(
    "radial-resolution-ordering",
    radial.length === 2 &&
      ordered(
        radial,
        (entry) =>
          entry.comparison.aggregate.geometry.silhouette
            .meanEdgeDistancePixels,
        0.02,
      ),
    radial.map((entry) => ({
      segmentCount: entry.segmentCount,
      meanEdgeDistancePixels:
        entry.comparison.aggregate.geometry.silhouette.meanEdgeDistancePixels,
      normalMeanDegrees:
        entry.comparison.aggregate.geometry.worldNormal.meanDegrees,
    })),
  );

  const deletion = (objects.get("umbrella")?.perturbations ?? []).find(
    (entry) => entry.category === "meaningful-component-deletion",
  );
  record(
    "component-deletion-exposes-geometry",
    deletion?.mutation?.removedTriangleCount > 0 &&
      deletion?.comparison?.aggregate?.geometry?.silhouette?.meanIou < 0.999 &&
      deletion?.comparison?.diagnostics?.surfaceArea?.relativeError > 0,
    deletion
      ? {
          mutation: deletion.mutation,
          meanIou: deletion.comparison.aggregate.geometry.silhouette.meanIou,
          surfaceAreaRelativeError:
            deletion.comparison.diagnostics.surfaceArea.relativeError,
        }
      : null,
  );

  const failures = checks.filter((check) => !check.passed);
  return {
    schemaVersion: "single-mesh-quality-calibration-acceptance-v1",
    passed: failures.length === 0,
    checkCount: checks.length,
    failureCount: failures.length,
    checks,
    failures,
  };
}
