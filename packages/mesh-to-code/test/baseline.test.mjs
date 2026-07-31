import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTROL_LADDERS,
  GEOMETRY_METRIC_DIRECTION,
  GUARD_FRACTION,
  freezeBaseline,
  generatePerturbationManifest,
  isFrozenBaseline,
  requireFrozenBaseline,
  runCalibrationBracket,
} from "../src/baseline/index.mjs";
import { createMesh } from "../src/geometry/mesh.mjs";
import { generateFixtureObj } from "../src/fixtures/generate.mjs";
import { parseObj } from "../src/ingest/obj.mjs";

function fixtureMesh(kind) {
  const parsed = parseObj(generateFixtureObj(kind));
  const positions = [];
  const indices = [];
  for (const selector of parsed.selectors) {
    const offset = positions.length / 3;
    positions.push(...selector.mesh.positions);
    for (const index of selector.mesh.indices) indices.push(offset + index);
  }
  return createMesh({ positions, indices, name: kind });
}

test("the manifest is generated from the mesh alone", () => {
  const manifest = generatePerturbationManifest({ mesh: fixtureMesh("lathe-profile") });
  assert.equal(manifest.generatedFrom, "the mesh alone; no per-object manifest is authored");
  assert.equal(
    /unitId|objectId|stone|umbrella|mushroom|candle|bamboo|vase|blue-hat/i.test(
      JSON.stringify(manifest.controls.map((control) => control.id)),
    ),
    false,
    "no control is named after a Reconstruction Unit",
  );

  const ids = manifest.controls.map((control) => control.id);
  for (const expected of [
    "uniform-scale/1.005",
    "pivot-shift/0.004",
    "rotate-y/1.0",
    "uniform-scale/1.05",
    "anisotropic-x/1.10",
    "squash-y/0.80",
    "pivot-shift/0.10",
    "delete-component",
    "reduce-family",
    "collapse-structure",
    "quantize-resolution/6",
    "flatten-appearance",
    "corrupt-palette",
  ]) {
    assert.ok(ids.includes(expected), `${expected} must be in the generated manifest`);
  }
  assert.ok(manifest.controls.some((control) => control.kind === "mild"));
  assert.ok(manifest.controls.some((control) => control.kind === "destructive"));
  for (const level of ["mild", "intermediate", "severe"]) {
    assert.ok(
      manifest.controls.some((control) => control.level === level),
      `the ladders must include a ${level} rung`,
    );
  }
});

test("a control the mesh cannot support is recorded, not dropped", () => {
  const manifest = generatePerturbationManifest({ mesh: fixtureMesh("lathe-profile") });
  const single = manifest.controls.find((control) => control.id === "delete-component");
  assert.equal(single.applicable, false);
  assert.match(single.notApplicableReason, /at least two connected components/);
  assert.equal(single.mesh, null);
  assert.equal(manifest.controls.length, CONTROL_LADDERS.length, "nothing is dropped");
});

test("appearance controls name no geometry metric", () => {
  const manifest = generatePerturbationManifest({ mesh: fixtureMesh("lathe-profile") });
  for (const control of manifest.controls.filter((entry) => entry.domain === "appearance")) {
    assert.deepEqual(
      control.metrics,
      [],
      `${control.id} leaves geometry untouched, so no geometry metric may be responsible for rejecting it`,
    );
  }
});

test("the bracket runs reference-only and reports it", () => {
  const bracket = runCalibrationBracket({
    mesh: fixtureMesh("lathe-profile"),
    stageId: "coarse",
  });
  assert.equal(bracket.candidatePresent, false);
  assert.equal(bracket.appearanceDomain.eligibilityEvaluated, false);
  assert.ok(bracket.appearanceDomain.controlsGenerated.length > 0);
});

test("eligibility is computed, and a hard threshold sits inside its bracket", () => {
  const bracket = runCalibrationBracket({
    mesh: fixtureMesh("two-component"),
    stageId: "coarse",
  });
  for (const [metricPath, metric] of Object.entries(bracket.metrics)) {
    assert.ok(
      ["hard", "diagnostic"].includes(metric.eligibility),
      `${metricPath} must be hard or diagnostic`,
    );
    if (metric.eligibility === "diagnostic") {
      assert.equal(metric.threshold, null, `${metricPath} must carry no threshold`);
      assert.ok(metric.reason.length > 0);
      continue;
    }
    const direction = GEOMETRY_METRIC_DIRECTION[metricPath];
    const { mildEnvelope, destructiveBoundary, threshold } = metric;
    if (direction === ">=") {
      assert.ok(
        threshold <= mildEnvelope && threshold > destructiveBoundary,
        `${metricPath}: ${threshold} must sit between ${destructiveBoundary} and ${mildEnvelope}`,
      );
    } else {
      assert.ok(
        threshold >= mildEnvelope && threshold < destructiveBoundary,
        `${metricPath}: ${threshold} must sit between ${mildEnvelope} and ${destructiveBoundary}`,
      );
    }
    assert.equal(metric.guardFraction, GUARD_FRACTION);
  }
});

test("a frozen baseline is the only thing fitting accepts", () => {
  const bracket = runCalibrationBracket({
    mesh: fixtureMesh("lathe-profile"),
    stageId: "coarse",
  });
  const baseline = freezeBaseline({
    unitId: "unit-0",
    version: "unit-0-automatic-geometry-baseline-v1",
    bracket,
    budget: { triangles: 512 },
    reachabilityBound: null,
  });

  assert.equal(isFrozenBaseline(baseline), true);
  assert.equal(baseline.record.calibratedBeforeFitting, true);
  assert.equal(baseline.record.candidateInformed, false);
  assert.ok(baseline.baselineHash.length >= 64);

  // A plain object with the same shape is refused: calibrate-before-fitting is
  // enforced by the type of the handle, not by convention.
  assert.throws(
    () => requireFrozenBaseline({ ...baseline.record }),
    /requires a baseline frozen by freezeBaseline/,
  );
  assert.throws(() => requireFrozenBaseline(null), /requires a baseline frozen/);

  assert.equal(baseline.fittingStarted, false);
  requireFrozenBaseline(baseline);
  assert.equal(baseline.fittingStarted, true);
});

test("no code path can loosen a threshold after fitting has begun", () => {
  const bracket = runCalibrationBracket({
    mesh: fixtureMesh("lathe-profile"),
    stageId: "coarse",
  });
  const baseline = freezeBaseline({
    unitId: "unit-0",
    version: "unit-0-automatic-geometry-baseline-v1",
    bracket,
    budget: { triangles: 512 },
    reachabilityBound: null,
  });
  requireFrozenBaseline(baseline);

  const hard = baseline.hardThresholds();
  assert.ok(hard.length > 0, "the fixture should yield at least one hard threshold");
  const metricPath = hard[0].path;

  assert.throws(() => {
    baseline.record.metrics[metricPath].threshold = 0;
  }, TypeError);
  assert.throws(() => {
    baseline.record.metrics[metricPath] = { threshold: 0 };
  }, TypeError);
  assert.throws(() => {
    baseline.record.version = "loosened";
  }, TypeError);
  assert.equal(baseline.record.metrics[metricPath].threshold, hard[0].threshold);
});

test("the frozen baseline gates on hard metrics and only reports diagnostic ones", () => {
  const bracket = runCalibrationBracket({
    mesh: fixtureMesh("two-component"),
    stageId: "coarse",
  });
  const baseline = freezeBaseline({
    unitId: "unit-0",
    version: "unit-0-automatic-geometry-baseline-v1",
    bracket,
    budget: { triangles: 512 },
    reachabilityBound: null,
  });

  const perfect = baseline.evaluate(bracket.identity);
  assert.equal(perfect.passed, true, "the reference against itself must pass its own baseline");

  const gatedPaths = new Set(baseline.hardThresholds().map((entry) => entry.path));
  for (const { path } of baseline.diagnosticMetrics()) {
    assert.equal(gatedPaths.has(path), false, `${path} is diagnostic and must not be gated on`);
  }
});

test("freezing refuses a bracket that saw a candidate", () => {
  const bracket = runCalibrationBracket({
    mesh: fixtureMesh("lathe-profile"),
    stageId: "coarse",
  });
  assert.throws(
    () =>
      freezeBaseline({
        unitId: "unit-0",
        version: "v1",
        bracket: { ...bracket, candidatePresent: true },
        budget: {},
        reachabilityBound: null,
      }),
    /reference-only bracket/,
  );
});
