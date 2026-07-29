import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { umbrellaGeometryFreezeEvidence } from "../tools/evaluation/umbrella-geometry-freeze.mjs";

test("Umbrella geometry and semantic hierarchy match the pre-appearance freeze", async () => {
  const frozen = JSON.parse(
    await readFile(
      new URL(
        "../gt_designer/single-mesh-evaluation/baselines/umbrella-geometry-freeze-v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(umbrellaGeometryFreezeEvidence(), frozen);
});
