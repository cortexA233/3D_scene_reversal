import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { verifyCandidateFreeze } from "../tools/evaluation/candidate-freeze.mjs";
import {
  selectStoneGeometryV2Thresholds,
  stoneGeometryV2CalibrationContractDefinition,
  validateStoneGeometryV2CalibrationContract,
} from "../tools/evaluation/stone-v2-calibration-contract.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function aggregateFor(value) {
  return {
    geometry: {
      bounds: {
        maxAxisRelativeError: value,
        bottomAnchorErrorCanonical: value,
      },
      silhouette: {
        meanIou: 1 - value,
        worstViewIou: 1 - value,
        meanEdgeDistancePixels: value,
        edgeDistanceP95Pixels: value,
      },
      depth: { mae: value, p95: value },
    },
  };
}

function syntheticRuns(contract, destructiveValue = 2) {
  return [1, 2].map((runIndex) => ({
    artifactRole: "development-only-authored-reference-calibration",
    objectId: "stone",
    runIndex,
    scenarios: contract.scenarios.map((scenario) => ({
      id: scenario.id,
      aggregate: aggregateFor(
        scenario.thresholdRole === "mild-envelope" ? 0.01 : destructiveValue,
      ),
    })),
  }));
}

test("Stone v2 calibration contract freezes complete ladders and input policy", () => {
  const contract = stoneGeometryV2CalibrationContractDefinition();
  assert.deepEqual(validateStoneGeometryV2CalibrationContract(contract), {
    passed: true,
    failures: [],
  });
  assert.equal(contract.capturePolicy.independentRuns, 2);
  assert.ok(contract.inputPolicy.prohibited.includes("known Stone candidate metrics"));
  assert.ok(contract.scenarios.filter(({ severity }) => severity === "mild").length >= 8);
  assert.ok(contract.scenarios.filter(({ mustReject }) => mustReject).length >= 8);
});

test("threshold selection uses only mild envelopes and fixed allowances", () => {
  const contract = stoneGeometryV2CalibrationContractDefinition();
  const result = selectStoneGeometryV2Thresholds({
    contract,
    runs: syntheticRuns(contract),
  });
  assert.equal(result.passed, true);
  assert.equal(result.diagnostic.length, 0);
  assert.equal(
    result.hard.find(({ path }) => path === "geometry.silhouette.meanIou")
      .threshold,
    0.988,
  );
  assert.equal(
    result.hard.find(({ path }) => path === "geometry.depth.p95").threshold,
    0.015,
  );
});

test("threshold selection rejects candidate-shaped or non-separating input", () => {
  const contract = stoneGeometryV2CalibrationContractDefinition();
  const candidateRuns = syntheticRuns(contract);
  candidateRuns[0].artifactRole = "development-only-object-acceptance";
  assert.throws(
    () => selectStoneGeometryV2Thresholds({ contract, runs: candidateRuns }),
    /Authored Reference calibration runs only/,
  );

  const result = selectStoneGeometryV2Thresholds({
    contract,
    runs: syntheticRuns(contract, 0.01),
  });
  assert.equal(result.passed, false);
  assert.ok(result.diagnostic.length > 0);
});

test("frozen contract and candidate hashes match the source-controlled files", async () => {
  const contract = stoneGeometryV2CalibrationContractDefinition();
  const frozenContract = JSON.parse(
    await readFile(
      path.join(
        PROJECT_ROOT,
        "gt_designer/single-mesh-evaluation/baselines/stone-geometry-v2-calibration-contract.json",
      ),
      "utf8",
    ),
  );
  assert.deepEqual(frozenContract, contract);
  const manifest = JSON.parse(
    await readFile(
      path.join(
        PROJECT_ROOT,
        "gt_designer/single-mesh-evaluation/baselines/stone-v2-candidate-freeze.json",
      ),
      "utf8",
    ),
  );
  assert.equal(manifest.freezeCommit, "e2d3b5e70a985abffa69a7faaf8dc38dc9b2fc35");
  assert.deepEqual(
    await verifyCandidateFreeze({ projectRoot: PROJECT_ROOT, manifest }),
    { passed: true, failures: [] },
  );
});
