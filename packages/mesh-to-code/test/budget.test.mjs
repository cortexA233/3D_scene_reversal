import assert from "node:assert/strict";
import test from "node:test";

import {
  AXIS_FLOOR,
  BUDGET_AXES,
  budgetFor,
  buildBudgetProxy,
  COARSE_CEILING_MULTIPLE,
  complexityGate,
  FEATURE_NAMES,
  featureVector,
  fitNonNegativeLeastSquares,
  FORMULA_COEFFICIENTS,
  GLOBAL_CEILING,
  measureReferenceComplexity,
  symmetryReducedParts,
} from "../src/budget/index.mjs";
import { weldedConnectedComponents } from "../src/kernel/decompose.mjs";
import { createMesh } from "../src/geometry/mesh.mjs";
import { generateFixtureObj } from "../src/fixtures/generate.mjs";
import { parseObj } from "../src/ingest/obj.mjs";

function fixtureMesh(kind) {
  const parsed = parseObj(generateFixtureObj(kind));
  if (parsed.selectors.length === 1) return parsed.selectors[0].mesh;
  const positions = [];
  const indices = [];
  for (const selector of parsed.selectors) {
    const offset = positions.length / 3;
    positions.push(...selector.mesh.positions);
    for (const index of selector.mesh.indices) indices.push(offset + index);
  }
  return createMesh({ positions, indices, name: kind });
}

function complexityOf(kind) {
  return measureReferenceComplexity({ mesh: fixtureMesh(kind) });
}

test("the formula takes a complexity measurement and nothing else", () => {
  const complexity = complexityOf("lathe-profile");
  const first = budgetFor(complexity);
  const second = budgetFor({ ...complexity });
  assert.deepEqual(first.budget, second.budget);

  // There is no per-object override path. The budget is a function of the four
  // complexity features and nothing else, so naming a unit cannot change it.
  const labelled = budgetFor({
    ...complexity,
    unitId: "umbrella",
    objectId: "umbrella",
    label: "Umbrella",
    budget: { triangles: 99999 },
    overrides: { triangles: 99999 },
  });
  assert.deepEqual(labelled.budget, first.budget);
  assert.deepEqual(Object.keys(first.features), [...FEATURE_NAMES]);
});

test("a budget never shrinks as the reference gets more complex", () => {
  const base = complexityOf("lathe-profile");
  const baseline = budgetFor(base).budget;
  for (const field of [
    "connectedComponentCount",
    "symmetryReducedPartCount",
    "materialRoleCount",
    "contourCurvatureComplexity",
  ]) {
    const raised = budgetFor({ ...base, [field]: base[field] * 4 + 1 }).budget;
    for (const axis of BUDGET_AXES) {
      assert.ok(
        raised[axis] >= baseline[axis],
        `raising ${field} lowered the ${axis} budget from ${baseline[axis]} to ${raised[axis]}`,
      );
    }
  }
});

test("no budget exceeds the global ceiling, however complex the input", () => {
  const absurd = {
    connectedComponentCount: 100000,
    symmetryReducedPartCount: 50000,
    materialRoleCount: 64,
    contourCurvatureComplexity: 200,
  };
  const applied = budgetFor(absurd);
  for (const axis of BUDGET_AXES) {
    assert.ok(
      applied.budget[axis] <= GLOBAL_CEILING[axis],
      `${axis} budget ${applied.budget[axis]} exceeded the ceiling ${GLOBAL_CEILING[axis]}`,
    );
    assert.equal(applied.detail[axis].clampedToCeiling, true);
  }
});

test("a trivial input still gets at least the declared floor", () => {
  const trivial = {
    connectedComponentCount: 1,
    symmetryReducedPartCount: 1,
    materialRoleCount: 1,
    contourCurvatureComplexity: 0,
  };
  const applied = budgetFor(trivial);
  for (const axis of BUDGET_AXES) {
    assert.ok(applied.budget[axis] >= AXIS_FLOOR[axis], axis);
  }
});

test("the complexity gate classifies full, coarse, and rejected", () => {
  assert.equal(complexityGate(complexityOf("lathe-profile")).tier, "full");

  const beyond = complexityGate({
    connectedComponentCount: 1e9,
    symmetryReducedPartCount: 1e9,
    materialRoleCount: 1,
    contourCurvatureComplexity: 500,
  });
  assert.equal(beyond.tier, "rejected");
  assert.match(beyond.splitRecommendation, /divide the input into units/);
  assert.ok(beyond.worstCeilingRatio > COARSE_CEILING_MULTIPLE);
  assert.ok(beyond.overruns.length > 0);
});

test("the Budget Proxy respects the triangle budget and is deterministic", () => {
  const mesh = fixtureMesh("over-complex");
  const triangleBudget = 512;
  assert.ok(mesh.triangleCount > triangleBudget, "the fixture must exceed the budget");

  const first = buildBudgetProxy({ mesh, triangleBudget });
  const second = buildBudgetProxy({ mesh, triangleBudget });
  assert.equal(first.constructed, true);
  assert.equal(first.budgetIsBinding, true);
  assert.ok(first.triangleCount <= triangleBudget);
  assert.ok(first.triangleCount >= 4);
  assert.deepEqual(
    [...first.mesh.positions],
    [...second.mesh.positions],
    "two constructions from the same input must agree exactly",
  );
  assert.deepEqual([...first.mesh.indices], [...second.mesh.indices]);
  assert.equal(first.construction.retains, "nothing; the proxy mesh is scored and discarded");
});

test("a non-binding budget returns the reference and says so", () => {
  const mesh = fixtureMesh("lathe-profile");
  const proxy = buildBudgetProxy({ mesh, triangleBudget: mesh.triangleCount * 8 });
  assert.equal(proxy.constructed, true);
  assert.equal(proxy.budgetIsBinding, false);
  assert.equal(proxy.triangleCount, mesh.triangleCount);
  assert.equal(proxy.lattice, null);
});

test("the proxy retains no resolution-dependent value", () => {
  const proxy = buildBudgetProxy({
    mesh: fixtureMesh("over-complex"),
    triangleBudget: 512,
  });
  const serialized = JSON.stringify({ ...proxy, mesh: undefined });
  assert.equal(
    /captureSize|pixel|width|height|texel|sample/i.test(serialized),
    false,
    "the proxy description must carry nothing measured in pixels",
  );
});

test("the fit is non-negative and drops features the corpus cannot identify", () => {
  const featureRows = [
    [1, 1, 1, 1, 1.2],
    [1, 2, 2, 1, 0.9],
    [1, 4, 3, 1, 1.9],
    [1, 6, 4, 1, 1.4],
  ];
  const fit = fitNonNegativeLeastSquares({
    featureRows,
    targets: [6.5, 8.3, 10.6, 12.5],
  });
  assert.ok(fit.coefficients.every((value) => value >= 0), "no coefficient may be negative");
  assert.deepEqual(fit.excludedFeatureNames, ["log2MaterialRoles"]);
  assert.equal(fit.coefficients[3], 0, "a constant column contributes nothing");
  assert.ok(fit.residualSumOfSquares >= 0);
});

test("congruent components collapse to one independent part", () => {
  const mesh = fixtureMesh("repeated-group");
  const { components } = weldedConnectedComponents(mesh);
  const parts = symmetryReducedParts(components);
  assert.equal(components.length, 5, "the fixture has five separated forms");
  assert.ok(
    parts.length < components.length,
    `five scaled copies of one form should reduce below five, got ${parts.length}`,
  );
});

test("the frozen coefficient table has one row per axis in feature order", () => {
  assert.deepEqual(FORMULA_COEFFICIENTS.featureNames, [...FEATURE_NAMES]);
  for (const axis of BUDGET_AXES) {
    const row = FORMULA_COEFFICIENTS.axes[axis];
    assert.equal(row.length, FEATURE_NAMES.length, axis);
    assert.ok(row.every((value) => value >= 0), `${axis} carries a negative coefficient`);
  }
  assert.ok(FORMULA_COEFFICIENTS.safetyLiftFactor >= 1);
  assert.equal(featureVector(complexityOf("lathe-profile")).length, FEATURE_NAMES.length);
});
