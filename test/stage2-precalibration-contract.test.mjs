import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { STAGE_2_OBJECT_BUDGETS } from "../tools/evaluation/stage2-precalibration-contract.mjs";

test("Stage 2 freezes separate budgets for all four remaining Lab objects", () => {
  assert.deepEqual(
    Object.keys(STAGE_2_OBJECT_BUDGETS).sort(),
    ["bamboo-shoot", "blue-hat", "candle", "mushroom"],
  );
  assert.notDeepEqual(
    STAGE_2_OBJECT_BUDGETS["bamboo-shoot"],
    STAGE_2_OBJECT_BUDGETS.mushroom,
  );
});

test("Stage 2 browser calibration source cannot import Procedural Replacements", async () => {
  const source = await readFile(
    new URL(
      "../gt_designer/single-mesh-evaluation/stage2-precalibration-runner.js",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /src\/reconstruction|object-registry|generator\.js|recipe\.js/,
  );
});
