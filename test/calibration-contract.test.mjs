import assert from "node:assert/strict";
import test from "node:test";

import {
  QUALITY_CALIBRATION_SCHEMA_VERSION,
  validateQualityCalibration,
} from "../tools/evaluation/calibration-contract.mjs";
import { qualityBaselineDefinition } from "../tools/evaluation/visual-metrics.mjs";

test("calibration acceptance rejects an incomplete report with named failures", () => {
  const result = validateQualityCalibration({
    schemaVersion: QUALITY_CALIBRATION_SCHEMA_VERSION,
    qualityBaseline: qualityBaselineDefinition(),
    calibrationPolicy: {
      correctionsUsed: 0,
      thresholdsFrozenAfterThisReport: true,
      replacementFailuresMayRelaxThresholds: false,
    },
    objects: [],
  });
  assert.equal(result.passed, false);
  assert.ok(
    result.failures.some((failure) => failure.id === "stage-1-object-coverage"),
  );
  assert.ok(
    result.failures.some((failure) => failure.id === "pivot-ordering"),
  );
});

test("calibration acceptance rejects changed source-controlled thresholds", () => {
  const baseline = qualityBaselineDefinition();
  baseline.common.maxAxisRelativeErrorMaximum = 0.5;
  const result = validateQualityCalibration({
    schemaVersion: QUALITY_CALIBRATION_SCHEMA_VERSION,
    qualityBaseline: baseline,
    calibrationPolicy: {
      correctionsUsed: 0,
      thresholdsFrozenAfterThisReport: true,
      replacementFailuresMayRelaxThresholds: false,
    },
    objects: [],
  });
  assert.ok(
    result.failures.some(
      (failure) => failure.id === "quality-baseline-definition",
    ),
  );
});
