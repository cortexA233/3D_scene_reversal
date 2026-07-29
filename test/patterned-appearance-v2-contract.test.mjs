import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluatePatternedAppearanceV2Gate,
  patternedAppearanceV2CalibrationContractDefinition,
  selectPatternedAppearanceV2Thresholds,
  validatePatternedAppearanceV2Contract,
} from "../tools/evaluation/patterned-appearance-v2-contract.mjs";
import { evaluatePatternedAppearanceView } from "../tools/evaluation/patterned-appearance-metrics.mjs";

function aggregate(value) {
  return {
    appearance: {
      meanDeltaE00: value,
      p90DeltaE00: value * 2,
      meanMaskedSsim: 1 - value / 100,
      worstViewSsim: 1 - value / 80,
      paletteCentroidDeltaE00: value,
      paletteCoverageL1: value / 100,
      roughnessAbsoluteError: 0,
      metalnessAbsoluteError: 0,
    },
    patterned: {
      flowerRecall: 1 - value / 100,
      leafRecall: 1 - value / 100,
      branchRecall: 1 - value / 100,
    },
  };
}

test("patterned appearance v2 declares a complete falsifiable bracket", () => {
  const contract = patternedAppearanceV2CalibrationContractDefinition();
  const validation = validatePatternedAppearanceV2Contract(contract);
  assert.equal(validation.passed, true, validation.failures.join(", "));
  assert.equal(
    contract.scenarios.filter(({ classification }) => classification === "should-pass").length,
    10,
  );
  assert.equal(
    contract.scenarios.filter(({ classification }) => classification === "must-reject").length,
    10,
  );
});

test("widest-safe selection keeps mild and destructive evidence separated", () => {
  const contract = patternedAppearanceV2CalibrationContractDefinition();
  const run = {
    scenarios: contract.scenarios.map((scenario) => ({
      id: scenario.id,
      aggregate: aggregate(scenario.classification === "should-pass" ? 1 : 20),
    })),
  };
  const selection = selectPatternedAppearanceV2Thresholds({
    contract,
    runs: [run, structuredClone(run)],
  });
  assert.equal(selection.passed, true, JSON.stringify(selection.groupFailures));
  const baseline = { version: contract.baselineVersion, hard: selection.hard };
  assert.equal(
    evaluatePatternedAppearanceV2Gate({ baseline, aggregate: aggregate(1) }).passed,
    true,
  );
  assert.equal(
    evaluatePatternedAppearanceV2Gate({ baseline, aggregate: aggregate(20) }).passed,
    false,
  );
});

test("browser calibration module has no Umbrella candidate import", async () => {
  const source = await readFile(
    new URL(
      "../gt_designer/single-mesh-evaluation/patterned-appearance-v2-calibration-runner.js",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /src\/reconstruction|umbrella-generator|umbrella-recipe|reports\/umbrella/,
  );
});

test("semantic pattern recall detects a removed flower pixel", () => {
  const silhouette = new Uint8Array([
    255, 255, 255, 255,
    255, 255, 255, 255,
  ]);
  const reference = new Uint8Array([
    240, 235, 225, 255,
    40, 90, 85, 255,
  ]);
  const replacement = new Uint8Array([
    132, 128, 78, 255,
    40, 90, 85, 255,
  ]);
  const evidence = evaluatePatternedAppearanceView({
    width: 2,
    height: 1,
    referenceSilhouette: silhouette,
    replacementSilhouette: silhouette,
    referenceAlbedo: reference,
    replacementAlbedo: replacement,
  });
  assert.equal(evidence.flower.referencePixels, 1);
  assert.equal(evidence.flower.recall, 0);
  assert.equal(evidence.leaf.recall, 1);
});

test("frozen patterned appearance contract matches its source", async () => {
  const frozen = JSON.parse(
    await readFile(
      new URL(
        "../gt_designer/single-mesh-evaluation/baselines/patterned-appearance-v2-calibration-contract.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(frozen, patternedAppearanceV2CalibrationContractDefinition());
});
