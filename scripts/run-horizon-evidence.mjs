/**
 * Quantify Horizon Groups and the 360-degree Horizon Profile.
 *
 *   node scripts/run-horizon-evidence.mjs           # measure and record
 *   node scripts/run-horizon-evidence.mjs --check   # verify the recorded evidence
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { generateScene } from "../gt_designer/src/reconstruction/scene/scene-generator.js";
import { readAuthoredPlacements } from "../tools/reconstruction/scene-placements.mjs";
import { compareHorizon } from "../tools/evaluation/horizon-evidence.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const EVIDENCE_DIRECTORY = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence",
);
const REPORT_PATH = path.join(EVIDENCE_DIRECTORY, "horizon-evidence-v1.json");
const checkOnly = process.argv.includes("--check");

/** The sixteen known authored distant-mountain groups. */
export const EXPECTED_HORIZON_GROUPS = 16;

/**
 * @param {object} [options]
 * @param {object} [options.recipe] an explicitly supplied Scene Recipe, so a
 *   caller that has just regenerated one is not served the module cache.
 */
export async function measureHorizon({ recipe = ISLAND_SCENE_RECIPE } = {}) {
  const [inventory, referenceEvidence] = await Promise.all([
    readFile(path.join(EVIDENCE_DIRECTORY, "scene-inventory-v1.json"), "utf8").then(
      JSON.parse,
    ),
    readFile(path.join(EVIDENCE_DIRECTORY, "horizon-reference-v1.json"), "utf8").then(
      JSON.parse,
    ),
  ]);

  const { placements } = readAuthoredPlacements(inventory, referenceEvidence);
  const byPath = new Map(referenceEvidence.groups.map((group) => [group.path, group]));
  const referenceGroups = new Map(
    placements
      .filter((placement) => placement.group === "horizon")
      .map((placement) => [
        placement.semanticId,
        {
          anchor: placement.anchor,
          extent: placement.extent,
          orientation: placement.orientation,
          profile: byPath.get(placement.key).profile,
          depthInterval: byPath.get(placement.key).depthInterval,
        },
      ]),
  );

  const generated = generateScene(recipe);
  const candidateGroups = new Map(
    [...generated.semanticIndex.entries()].filter(
      ([, record]) => record.group === "horizon",
    ),
  );

  return {
    referenceGroups,
    report: compareHorizon({
      referenceEvidence,
      referenceGroups,
      candidateGroups,
      anchor: recipe.sceneAnchor,
      overviewPosition: recipe.environment.camera.position,
    }),
  };
}

async function main() {
  const { referenceGroups, report } = await measureHorizon();

  assert.equal(
    referenceGroups.size,
    EXPECTED_HORIZON_GROUPS,
    `expected ${EXPECTED_HORIZON_GROUPS} identity-bearing Horizon Groups`,
  );
  assert.deepEqual(report.groups.missing, [], "the candidate is missing Horizon Groups");
  assert.equal(report.groups.candidate, EXPECTED_HORIZON_GROUPS);
  assert.equal(
    report.profile.missingBins,
    0,
    "the candidate leaves part of the Horizon Profile empty",
  );

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (checkOnly) {
    const frozen = await readFile(REPORT_PATH, "utf8");
    assert.equal(frozen, serialized, "horizon evidence drifted");
  } else {
    await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
    await writeFile(REPORT_PATH, serialized);
  }

  const degrees = (radians) => ((radians * 180) / Math.PI).toFixed(4);
  process.stdout.write(
    `Horizon: ${report.groups.candidate}/${report.groups.reference} groups, ` +
      `anchor max ${report.groups.anchorError.max.toFixed(4)}, ` +
      `depth p95 ${report.groups.depthError.p95.toFixed(2)}, ` +
      `visible-angle p95 ${report.groups.visibleAngleRelativeError.p95}, ` +
      `overlap order max ${report.groups.overlapOrderError.max}, ` +
      `profile p95 ${degrees(report.profile.angularError.p95)} deg ` +
      `(worst ${degrees(report.profile.angularError.max)} deg)\n`,
  );
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}
