/**
 * Compare semantic layout and direct surfaces.
 *
 * Observes the immutable Authored Reference and the real generated production
 * candidate through one scene-observation seam and emits structural,
 * world-layout, relational, zone, overlap-ordering, distributed-cover, and
 * topology-independent surface evidence.
 *
 *   node scripts/run-scene-correspondence.mjs           # measure and record
 *   node scripts/run-scene-correspondence.mjs --check   # verify the recorded evidence
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { generateScene } from "../gt_designer/src/reconstruction/scene/scene-generator.js";
import {
  observeAuthoredReference,
  observeCandidate,
} from "../tools/evaluation/scene-observation.mjs";
import { compareScenes } from "../tools/evaluation/scene-correspondence.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const EVIDENCE_DIRECTORY = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence",
);
const REPORT_PATH = path.join(EVIDENCE_DIRECTORY, "scene-correspondence-v1.json");
const checkOnly = process.argv.includes("--check");

async function readEvidence(name) {
  return JSON.parse(await readFile(path.join(EVIDENCE_DIRECTORY, name), "utf8"));
}

export async function measureCorrespondence() {
  const [inventory, samples] = await Promise.all([
    readEvidence("scene-inventory-v1.json"),
    readEvidence("scene-surface-samples-v1.json"),
  ]);
  const reference = observeAuthoredReference({ inventory, samples });
  const candidate = observeCandidate(generateScene(ISLAND_SCENE_RECIPE));
  return compareScenes(reference, candidate, {
    sceneAnchor: ISLAND_SCENE_RECIPE.sceneAnchor,
  });
}

async function main() {
  const report = await measureCorrespondence();

  // Infrastructure must hold even while the candidate is red.
  assert.equal(
    report.adapterIntegrity.passed,
    true,
    `the Candidate Adapter applied a transient correction:\n- ${(
      report.adapterIntegrity.candidate.corrections ?? []
    ).join("\n- ")}`,
  );
  assert.equal(report.structural.missing.length, 0, "candidate is missing entities");
  assert.equal(report.structural.extra.length, 0, "candidate invented entities");
  assert.equal(report.structural.typeMismatch.length, 0, "candidate mistyped entities");

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (checkOnly) {
    const frozen = await readFile(REPORT_PATH, "utf8");
    assert.equal(frozen, serialized, "scene correspondence evidence drifted");
  } else {
    await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
    await writeFile(REPORT_PATH, serialized);
  }

  process.stdout.write(
    `Scene correspondence: ${report.structural.candidateEntities}/${report.structural.referenceEntities} entities, ` +
      `anchor p95 ${report.placement.anchorError.p95}, extent p95 ${report.placement.extentRelative.p95}, ` +
      `orientation p95 ${report.placement.orientationError.p95}, ` +
      `surface p95 ${report.surface.p95.p95} (worst ${report.surface.p95.max}), ` +
      `component delta p95 ${report.semanticStructure.componentDelta.p95}\n`,
  );
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}
