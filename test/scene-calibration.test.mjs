import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BASELINE_SCHEMA,
  CALIBRATION_SCHEMA,
  selectThreshold,
  undetectedControls,
  verifyCalibrationInputs,
} from "../tools/evaluation/scene-calibration.mjs";
import {
  GEOGRAPHY_CONTROLS,
  HORIZON_CONTROLS,
  SCENE_CONTROLS,
} from "../tools/evaluation/scene-perturbations.mjs";
import { evaluateSceneParityGateStack } from "../tools/acceptance/scene-parity-gates.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const [calibration, baseline] = await Promise.all([
  readFile(
    path.join(
      PROJECT_ROOT,
      ".scratch/scene-parity-foundation/evidence/scene-calibration-v1.json",
    ),
    "utf8",
  ).then(JSON.parse),
  readFile(
    path.join(PROJECT_ROOT, "tools/acceptance/baselines/scene-quality-baseline-v1.json"),
    "utf8",
  ).then(JSON.parse),
]);

test("a threshold sits strictly between mild variation and declared damage", () => {
  const chosen = selectThreshold({ mild: [0, 1, 2], severe: [10, 14], direction: "atMost" });
  assert.equal(chosen.separable, true);
  assert.ok(chosen.threshold > 2 && chosen.threshold < 10);
  assert.equal(chosen.threshold, 4);

  const atLeast = selectThreshold({ mild: [0.99, 1], severe: [0.5, 0.6], direction: "atLeast" });
  assert.equal(atLeast.separable, true);
  assert.ok(atLeast.threshold < 0.99 && atLeast.threshold > 0.6);
});

test("a metric that cannot separate the bracket is demoted, not loosened", () => {
  const overlapping = selectThreshold({
    mild: [0, 9],
    severe: [4, 20],
    direction: "atMost",
  });
  assert.equal(overlapping.separable, false);
  assert.equal(overlapping.threshold, null);
  assert.match(overlapping.reason, /cannot tell them apart/);

  const untargeted = selectThreshold({ mild: [0], severe: [], direction: "atMost" });
  assert.equal(untargeted.separable, false);
  assert.match(untargeted.reason, /no declared damage control targets/);
});

test("semantic identity is exact rather than a calibrated tolerance", () => {
  const exact = selectThreshold({ mild: [0, 0], severe: [13], direction: "atMost", exact: true });
  assert.equal(exact.threshold, 0);
  assert.equal(exact.exact, true);

  assert.equal(
    selectThreshold({ mild: [0, 1], severe: [13], direction: "atMost", exact: true }).separable,
    false,
    "an exact metric that moves under mild variation is not exact",
  );
  assert.equal(
    selectThreshold({ mild: [0], severe: [0], direction: "atMost", exact: true }).separable,
    false,
    "damage that leaves an exact metric at zero proves nothing",
  );

  for (const name of ["missing entities", "extra entities"]) {
    const metric = baseline.layers.structuralCorrespondence.find((row) => row.name === name);
    assert.equal(metric.threshold, 0, `${name} must be exact`);
  }
});

test("every declared damage control is caught by at least one gating metric", () => {
  const metrics = calibration.metrics.map((metric) => ({
    calibration: metric.calibration,
    detectedControls: metric.detectedControls,
  }));
  for (const controls of [SCENE_CONTROLS, GEOGRAPHY_CONTROLS, HORIZON_CONTROLS]) {
    assert.deepEqual(undetectedControls({ controls, metrics }), []);
  }
  assert.deepEqual(calibration.undetectedControls, []);
});

test("every mild control passes every gating metric it is compared against", () => {
  for (const metric of calibration.metrics) {
    if (!metric.calibration.separable) continue;
    for (const value of metric.samples.mild) {
      const passed =
        metric.direction === "atMost"
          ? value <= metric.calibration.threshold
          : value >= metric.calibration.threshold;
      assert.ok(
        passed,
        `${metric.name}: mild control result ${value} does not pass its own threshold ${metric.calibration.threshold}`,
      );
    }
  }
});

test("every declared damage result fails the threshold it is meant to trip", () => {
  for (const metric of calibration.metrics) {
    if (!metric.calibration.separable) continue;
    for (const value of metric.samples.severe) {
      const passed =
        metric.direction === "atMost"
          ? value <= metric.calibration.threshold
          : value >= metric.calibration.threshold;
      assert.ok(
        !passed,
        `${metric.name}: declared damage result ${value} still passes ${metric.calibration.threshold}`,
      );
    }
  }
});

test("the calibration input graph contains no candidate artifact", () => {
  assert.equal(calibration.schemaVersion, CALIBRATION_SCHEMA);
  assert.deepEqual(calibration.candidateArtifactsRead, []);
  assert.deepEqual(verifyCalibrationInputs(calibration.inputs), []);
  assert.ok(
    verifyCalibrationInputs([...calibration.inputs, "scene-correspondence-v1.json"]).length > 0,
    "adding a candidate report must be rejected",
  );
});

test("the frozen baseline is versioned and covers the calibrated layers", () => {
  assert.equal(baseline.schemaVersion, BASELINE_SCHEMA);
  assert.equal(baseline.version, "scene-quality-baseline-v1");
  assert.ok(baseline.layers.structuralCorrespondence.length >= 6);
  assert.ok(baseline.layers.worldGeometry.length >= 10);
  for (const metric of [
    ...baseline.layers.structuralCorrespondence,
    ...baseline.layers.worldGeometry,
  ]) {
    assert.ok(Number.isFinite(metric.threshold));
    assert.ok(["atMost", "atLeast"].includes(metric.direction));
    assert.ok(typeof metric.path === "string" && metric.path.includes("."));
  }
  assert.ok(
    baseline.knownProperties.some((note) => note.includes("absolute world units")),
    "the baseline records that its placement limits are scale-sensitive",
  );
});

test("an uncalibrated layer cannot pass vacuously", () => {
  const frozen = JSON.parse(JSON.stringify(baseline));
  const deepFreeze = (value) => {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) deepFreeze(child);
      Object.freeze(value);
    }
    return value;
  };
  const report = evaluateSceneParityGateStack({
    evidence: {
      coverage: { schemaVersion: "semantic-coverage-manifest-v2", blocking: { visibleUnclassifiedCount: 0 } },
      correspondence: {
        schemaVersion: "scene-correspondence-v1",
        adapterIntegrity: { passed: true },
        structural: { missing: [], extra: [] },
        placement: {
          anchorError: { p95: 0, max: 0 },
          extentRelative: { max: 0 },
          orientationError: { max: 0 },
        },
        surface: { p95: { mean: 0, max: 0 }, overToleranceFraction: { mean: 0 } },
        relational: { distanceError: { max: 0 } },
        zones: { delta: { max: 0 } },
        semanticStructure: { componentDelta: { max: 0 } },
      },
      geography: {
        schemaVersion: "geography-evidence-v1",
        height: { full: { p95: 0 }, shore: { p95: 0 } },
        coastline: { symmetricDistance: { p95: 0 }, areaRelativeError: 0 },
        classification: { agreementFraction: 1 },
      },
      horizon: {
        schemaVersion: "horizon-comparison-v1",
        profile: { angularError: { p95: 0, max: 0 } },
      },
      passes: { schemaVersion: "scene-pass-evidence-v1", aggregate: {} },
    },
    baseline: deepFreeze(frozen),
  });

  // A perfect 3D result still cannot certify: two layers have no frozen
  // thresholds yet, so they are not evaluated and cannot pass.
  assert.equal(report.layers.structuralCorrespondence.passed, true);
  assert.equal(report.layers.worldGeometry.passed, true);
  assert.equal(report.layers.fixedCameraGeometry.evaluated, false);
  assert.equal(report.layers.fixedCameraGeometry.passed, false);
  assert.match(report.layers.fixedCameraGeometry.reason, /no frozen thresholds/);
  assert.equal(report.exitStatus, "candidate-failure");
});
