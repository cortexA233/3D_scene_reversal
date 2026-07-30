import assert from "node:assert/strict";
import test from "node:test";

import {
  EVIDENCE_FAMILIES,
  GATE_LAYERS,
  GATE_STACK_SCHEMA,
  evaluateSceneParityGateStack,
} from "../tools/acceptance/scene-parity-gates.mjs";

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const baseline = deepFreeze({
  schemaVersion: "scene-quality-baseline-v1",
  version: "test-baseline",
  layers: {
    structuralCorrespondence: [
      {
        name: "missing entities",
        scope: "aggregate",
        path: "correspondence.structural.missing.length",
        direction: "atMost",
        threshold: 0,
      },
      {
        name: "worst entity anchor error",
        scope: "worst-entity",
        path: "correspondence.placement.anchorError.max",
        direction: "atMost",
        threshold: 0.5,
      },
    ],
    worldGeometry: [
      {
        name: "surface p95",
        scope: "aggregate",
        path: "correspondence.surface.p95.mean",
        direction: "atMost",
        threshold: 2,
      },
      {
        name: "worst entity surface p95",
        scope: "worst-entity",
        path: "correspondence.surface.p95.max",
        direction: "atMost",
        threshold: 6,
      },
      {
        name: "worst azimuth horizon error",
        scope: "worst-azimuth",
        path: "horizon.profile.angularError.max",
        direction: "atMost",
        threshold: 0.02,
      },
    ],
    fixedCameraGeometry: [
      {
        name: "silhouette IoU",
        scope: "aggregate",
        path: "passes.aggregate.silhouetteIoU.mean",
        direction: "atLeast",
        threshold: 0.9,
      },
      {
        name: "worst camera silhouette IoU",
        scope: "worst-camera",
        path: "passes.aggregate.silhouetteIoU.worst.value",
        direction: "atLeast",
        threshold: 0.8,
      },
    ],
    nativeAppearance: [
      {
        name: "appearance DeltaE",
        scope: "aggregate",
        path: "passes.aggregate.appearanceDeltaE.meanMean",
        direction: "atMost",
        threshold: 8,
      },
    ],
  },
});

function evidence(overrides = {}) {
  const base = {
    coverage: {
      schemaVersion: EVIDENCE_FAMILIES.coverage,
      blocking: { visibleUnclassifiedCount: 0 },
    },
    correspondence: {
      schemaVersion: EVIDENCE_FAMILIES.correspondence,
      adapterIntegrity: { passed: true },
      structural: { missing: [] },
      placement: { anchorError: { max: 0 } },
      surface: { p95: { mean: 1, max: 4 } },
    },
    geography: { schemaVersion: EVIDENCE_FAMILIES.geography },
    horizon: {
      schemaVersion: EVIDENCE_FAMILIES.horizon,
      profile: { angularError: { max: 0.01 } },
    },
    passes: {
      schemaVersion: EVIDENCE_FAMILIES.passes,
      aggregate: {
        silhouetteIoU: { mean: 0.95, worst: { camera: "oblique-north", value: 0.92 } },
        appearanceDeltaE: { meanMean: 4 },
      },
    },
  };
  return { ...base, ...overrides };
}

test("a compliant candidate passes every layer independently", () => {
  const report = evaluateSceneParityGateStack({ evidence: evidence(), baseline });

  assert.equal(report.schemaVersion, GATE_STACK_SCHEMA);
  assert.equal(report.exitStatus, "pass");
  assert.equal(report.infrastructure.passed, true);
  for (const layer of GATE_LAYERS) {
    assert.equal(report.layers[layer].evaluated, true, `${layer} was not evaluated`);
    assert.equal(report.layers[layer].passed, true, `${layer} failed`);
  }
  assert.deepEqual(report.candidate.failedLayers, []);
});

test("the stack refuses to run without a frozen baseline", () => {
  assert.throws(
    () => evaluateSceneParityGateStack({ evidence: evidence(), baseline: { version: "x" } }),
    /scene-quality-baseline-v1/,
  );
  assert.throws(
    () =>
      evaluateSceneParityGateStack({
        evidence: evidence(),
        baseline: { ...baseline, schemaVersion: "scene-quality-baseline-v1" },
      }),
    /immutable/,
  );
});

test("native appearance is not evaluated until geometry passes", () => {
  const report = evaluateSceneParityGateStack({
    evidence: evidence({
      correspondence: {
        ...evidence().correspondence,
        surface: { p95: { mean: 12, max: 46 } },
      },
    }),
    baseline,
  });

  assert.equal(report.layers.worldGeometry.passed, false);
  assert.equal(report.layers.nativeAppearance.evaluated, false);
  assert.deepEqual(report.layers.nativeAppearance.blockedBy, ["worldGeometry"]);
  assert.equal(report.exitStatus, "candidate-failure");
});

test("perfect materials cannot compensate for broken geometry", () => {
  const report = evaluateSceneParityGateStack({
    evidence: evidence({
      correspondence: {
        ...evidence().correspondence,
        surface: { p95: { mean: 40, max: 200 } },
      },
      passes: {
        schemaVersion: EVIDENCE_FAMILIES.passes,
        aggregate: {
          silhouetteIoU: { mean: 0.95, worst: { camera: "topDown", value: 0.93 } },
          // A flawless appearance number.
          appearanceDeltaE: { meanMean: 0 },
        },
      },
    }),
    baseline,
  });

  assert.equal(report.candidate.passed, false);
  assert.deepEqual(report.candidate.failedLayers, ["worldGeometry", "nativeAppearance"]);
});

test("one favourable camera cannot hide the opposing view", () => {
  const report = evaluateSceneParityGateStack({
    evidence: evidence({
      passes: {
        schemaVersion: EVIDENCE_FAMILIES.passes,
        aggregate: {
          // A high mean carried by five good cameras.
          silhouetteIoU: { mean: 0.93, worst: { camera: "oblique-south", value: 0.41 } },
          appearanceDeltaE: { meanMean: 3 },
        },
      },
    }),
    baseline,
  });

  assert.equal(report.layers.fixedCameraGeometry.passed, false);
  assert.ok(
    report.layers.fixedCameraGeometry.failures.some((failure) =>
      failure.includes("worst camera"),
    ),
  );
});

test("a good aggregate cannot hide one failed entity or azimuth", () => {
  const worstEntity = evaluateSceneParityGateStack({
    evidence: evidence({
      correspondence: {
        ...evidence().correspondence,
        // Aggregate well inside the limit, one entity far outside it.
        surface: { p95: { mean: 0.4, max: 55 } },
      },
    }),
    baseline,
  });
  assert.equal(worstEntity.layers.worldGeometry.passed, false);
  assert.ok(
    worstEntity.layers.worldGeometry.failures.some((failure) =>
      failure.includes("worst entity"),
    ),
  );

  const worstAzimuth = evaluateSceneParityGateStack({
    evidence: evidence({
      horizon: {
        schemaVersion: EVIDENCE_FAMILIES.horizon,
        profile: { angularError: { max: 0.12 } },
      },
    }),
    baseline,
  });
  assert.equal(worstAzimuth.layers.worldGeometry.passed, false);
  assert.ok(
    worstAzimuth.layers.worldGeometry.failures.some((failure) =>
      failure.includes("worst azimuth"),
    ),
  );
});

test("infrastructure failure is distinguished from candidate quality", () => {
  const missingFamily = evaluateSceneParityGateStack({
    evidence: { ...evidence(), geography: undefined },
    baseline,
  });
  assert.equal(missingFamily.exitStatus, "infrastructure-failure");
  assert.ok(missingFamily.infrastructure.failures.some((f) => f.includes("geography")));

  const staleSchema = evaluateSceneParityGateStack({
    evidence: evidence({
      horizon: { schemaVersion: "horizon-comparison-v0", profile: { angularError: { max: 0 } } },
    }),
    baseline,
  });
  assert.equal(staleSchema.exitStatus, "infrastructure-failure");

  const fittedAdapter = evaluateSceneParityGateStack({
    evidence: evidence({
      correspondence: { ...evidence().correspondence, adapterIntegrity: { passed: false } },
    }),
    baseline,
  });
  assert.equal(fittedAdapter.exitStatus, "infrastructure-failure");
  assert.ok(
    fittedAdapter.infrastructure.failures.some((f) => f.includes("transient correction")),
  );

  const unclassified = evaluateSceneParityGateStack({
    evidence: evidence({
      coverage: {
        schemaVersion: EVIDENCE_FAMILIES.coverage,
        blocking: { visibleUnclassifiedCount: 7 },
      },
    }),
    baseline,
  });
  assert.equal(unclassified.exitStatus, "infrastructure-failure");
});

test("missing evidence inside a layer fails rather than passing silently", () => {
  const report = evaluateSceneParityGateStack({
    evidence: evidence({
      correspondence: {
        ...evidence().correspondence,
        surface: { p95: { mean: 1 } },
      },
    }),
    baseline,
  });

  assert.equal(report.layers.worldGeometry.passed, false);
  assert.ok(report.layers.worldGeometry.failures.some((f) => f.includes("missing")));
});

test("the trend index is diagnostic and never decides a gate", () => {
  const failing = evaluateSceneParityGateStack({
    evidence: evidence({
      correspondence: {
        ...evidence().correspondence,
        surface: { p95: { mean: 40, max: 200 } },
      },
    }),
    baseline,
  });

  assert.equal(failing.trendIndex.authoritative, false);
  assert.ok(failing.trendIndex.value > 0.5, "the trend index can look healthy while gates fail");
  assert.equal(failing.candidate.passed, false);
  assert.equal(failing.exitStatus, "candidate-failure");
  // No layer result references the trend index.
  for (const layer of GATE_LAYERS) {
    assert.equal(failing.layers[layer].trendIndex, undefined);
  }
});

test("acceptance does not mutate its inputs", () => {
  const input = evidence();
  const snapshot = JSON.stringify(input);
  const baselineSnapshot = JSON.stringify(baseline);

  evaluateSceneParityGateStack({ evidence: input, baseline });

  assert.equal(JSON.stringify(input), snapshot);
  assert.equal(JSON.stringify(baseline), baselineSnapshot);
});
