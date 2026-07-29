import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  aggregateSemanticPatternCoverageEvidence,
  evaluateSemanticPatternCoverageView,
} from "../tools/evaluation/patterned-appearance-metrics.mjs";
import {
  evaluatePatternedAppearanceV3Gate,
  validatePatternedAppearanceV3Baseline,
} from "../tools/evaluation/patterned-appearance-v3-contract.mjs";
import { UMBRELLA_RECIPE } from "../gt_designer/src/reconstruction/objects/umbrella-recipe.js";
import { createUmbrellaAppearanceVariantRecipe } from "../gt_designer/single-mesh-evaluation/umbrella-v3-appearance-variants.js";

const WHITE = [255, 255, 255, 255];
const FLOWER = [192, 198, 188, 255];
const LEAF = [16, 38, 32, 255];
const BRANCH = [9, 17, 14, 255];
const CANOPY = [130, 130, 130, 255];

function rgba(...pixels) {
  return new Uint8Array(pixels.flat());
}

function capturedAggregate({ flower, leaf, branch, total, distances = [1, 7, 7] }) {
  return {
    appearance: {
      roughnessAbsoluteError: 0,
      metalnessAbsoluteError: 0,
    },
    semanticPattern: {
      roles: {
        flower: { replacementCoverage: flower, meanReplacementRoleDistance: distances[0] },
        leaf: { replacementCoverage: leaf, meanReplacementRoleDistance: distances[1] },
        branch: { replacementCoverage: branch, meanReplacementRoleDistance: distances[2] },
      },
      total: { replacementCoverage: total },
    },
  };
}

test("semantic v3 coverage is position tolerant", () => {
  const silhouette = rgba(WHITE, WHITE, WHITE, WHITE);
  const reference = rgba(FLOWER, CANOPY, LEAF, BRANCH);
  const replacement = rgba(CANOPY, FLOWER, BRANCH, LEAF);
  const evidence = evaluateSemanticPatternCoverageView({
    width: 4,
    height: 1,
    referenceSilhouette: silhouette,
    replacementSilhouette: silhouette,
    referenceAlbedo: reference,
    replacementAlbedo: replacement,
  });
  assert.equal(evidence.roles.flower.referencePixels, 1);
  assert.equal(evidence.roles.flower.replacementPixels, 1);
  assert.equal(evidence.roles.leaf.replacementPixels, 1);
  assert.equal(evidence.roles.branch.replacementPixels, 1);
});

test("semantic v3 coverage exposes family deletion", () => {
  const silhouette = rgba(WHITE, WHITE, WHITE, WHITE);
  const reference = rgba(FLOWER, CANOPY, LEAF, BRANCH);
  const replacement = rgba(CANOPY, CANOPY, LEAF, BRANCH);
  const semanticPattern = evaluateSemanticPatternCoverageView({
    width: 4,
    height: 1,
    referenceSilhouette: silhouette,
    replacementSilhouette: silhouette,
    referenceAlbedo: reference,
    replacementAlbedo: replacement,
  });
  const aggregate = aggregateSemanticPatternCoverageEvidence([
    { viewId: "synthetic", semanticPattern },
  ]);
  assert.equal(aggregate.roles.flower.referenceCoverage, 0.25);
  assert.equal(aggregate.roles.flower.replacementCoverage, 0);
  assert.equal(aggregate.roles.flower.coverageRatio, 0);
  assert.equal(aggregate.roles.leaf.coverageRatio, 1);
  assert.equal(aggregate.roles.branch.coverageRatio, 1);
});

test("v3 damage controls do not mutate the approved production recipe", () => {
  const flowerDeletion = createUmbrellaAppearanceVariantRecipe(
    UMBRELLA_RECIPE,
    "delete-flower-family",
  );
  const branchDeletion = createUmbrellaAppearanceVariantRecipe(
    UMBRELLA_RECIPE,
    "delete-branch-family",
  );
  assert.equal(flowerDeletion.appearance.blossoms.length, 0);
  assert.equal(
    branchDeletion.appearance.branchColor,
    UMBRELLA_RECIPE.appearance.canopyColor,
  );
  assert.equal(UMBRELLA_RECIPE.appearance.blossoms.length, 5);
  assert.equal(UMBRELLA_RECIPE.appearance.branchColor, 0x344943);
});

test("human-anchored v3 accepts the approved capture and rejects every damage control", async () => {
  const baseline = JSON.parse(
    await readFile(
      new URL(
        "../gt_designer/single-mesh-evaluation/baselines/patterned-appearance-baseline-v3.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const validation = validatePatternedAppearanceV3Baseline(baseline);
  assert.equal(validation.passed, true, validation.failures.join(", "));
  const approved = capturedAggregate({
    flower: 0.0206322574,
    leaf: 0.0316932039,
    branch: 0.0228655632,
    total: 0.0751910245,
  });
  assert.equal(
    evaluatePatternedAppearanceV3Gate({ baseline, aggregate: approved }).passed,
    true,
  );
  const rejected = [
    capturedAggregate({ flower: 0, leaf: 0, branch: 0, total: 0 }),
    capturedAggregate({
      flower: 0.0201548395,
      leaf: 0,
      branch: 0.0202122214,
      total: 0.0403670609,
      distances: [12.33, null, 13.16],
    }),
    capturedAggregate({ flower: 0, leaf: 0.0325654097, branch: 0.0447418615, total: 0.0773072712 }),
    capturedAggregate({ flower: 0.0206322574, leaf: 0.0034612798, branch: 0.007601962, total: 0.0316954992 }),
    capturedAggregate({ flower: 0.0206322574, leaf: 0.0012968323, branch: 0, total: 0.0219290897 }),
    capturedAggregate({ flower: 0.0140815329, leaf: 0.0184540382, branch: 0.0188373497, total: 0.0513729208 }),
  ];
  for (const aggregate of rejected) {
    assert.equal(
      evaluatePatternedAppearanceV3Gate({ baseline, aggregate }).passed,
      false,
    );
  }
});
