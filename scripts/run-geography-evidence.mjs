/**
 * Quantify terrain, coastline, and Semantic Sea Level.
 *
 *   node scripts/run-geography-evidence.mjs           # measure and record
 *   node scripts/run-geography-evidence.mjs --check   # verify the recorded evidence
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { generateScene } from "../gt_designer/src/reconstruction/scene/scene-generator.js";
import {
  TERRAIN_CONTROL_BUDGET,
  createTerrainProgramField,
  validateTerrainProgram,
} from "../gt_designer/src/reconstruction/scene/terrain-program.js";
import { elevationSampler } from "../tools/reconstruction/fit-terrain-program.mjs";
import { compareGeography } from "../tools/evaluation/geography-evidence.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const EVIDENCE_DIRECTORY = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence",
);
const REPORT_PATH = path.join(EVIDENCE_DIRECTORY, "geography-evidence-v1.json");
const CAMERA_SET_PATH = path.join(
  PROJECT_ROOT,
  "tools/reference/baselines/reference-camera-set-v2.json",
);
const checkOnly = process.argv.includes("--check");

/**
 * The Ocean Appearance Surface must cover every frozen camera's view of the
 * sea plane, not just the authored overview. The required radius is how far the
 * far plane reaches across the water from each camera.
 */
function cameraFrusta(cameraSet, seaLevel) {
  const cameras = [
    { name: "authoredOverview", camera: cameraSet.authoredOverview },
    { name: "topDown", camera: cameraSet.topDown },
    ...Object.entries(cameraSet.obliques).map(([name, camera]) => ({
      name: `oblique-${name}`,
      camera,
    })),
  ];
  return cameras.map(({ name, camera }) => ({
    name,
    centre: [camera.position[0], seaLevel, camera.position[2]],
    radius: camera.far ?? ISLAND_SCENE_RECIPE.environment.camera.far,
  }));
}

async function main() {
  const [elevationEvidence, cameraSet] = await Promise.all([
    readFile(path.join(EVIDENCE_DIRECTORY, "terrain-elevation-v1.json"), "utf8").then(
      JSON.parse,
    ),
    readFile(CAMERA_SET_PATH, "utf8").then(JSON.parse),
  ]);

  const programErrors = validateTerrainProgram(ISLAND_SCENE_RECIPE.terrain);
  assert.deepEqual(programErrors, [], "the Bounded Semantic Terrain Program is invalid");
  assert.ok(
    ISLAND_SCENE_RECIPE.terrain.coastline.nodes.length <= TERRAIN_CONTROL_BUDGET.coastNodes,
    "the coastline exceeded its frozen control budget",
  );

  const sampler = elevationSampler(elevationEvidence);
  const generated = generateScene(ISLAND_SCENE_RECIPE);
  const candidateElevation = createTerrainProgramField(ISLAND_SCENE_RECIPE.terrain);

  const ocean = generated.semanticIndex.get("island")
    ? null
    : null;
  let oceanBounds = null;
  generated.root.traverse((object) => {
    if (object.userData.semanticId === "environment/ocean-appearance-surface") {
      const box = new THREE.Box3().setFromObject(object);
      oceanBounds = { min: box.min.toArray(), max: box.max.toArray() };
    }
  });
  void ocean;
  assert.ok(oceanBounds, "the candidate has no Ocean Appearance Surface");

  const report = compareGeography({
    referenceElevation: (x, z) => sampler.at(x, z),
    candidateElevation,
    centre: ISLAND_SCENE_RECIPE.terrain.coastline.center,
    seaLevel: ISLAND_SCENE_RECIPE.world.semanticSeaLevel,
    seaLevelNormal: ISLAND_SCENE_RECIPE.world.seaLevelNormal,
    oceanBounds,
    cameraFrusta: cameraFrusta(
      cameraSet,
      ISLAND_SCENE_RECIPE.world.semanticSeaLevel,
    ),
  });
  report.terrainProgram = {
    version: ISLAND_SCENE_RECIPE.terrain.version,
    coastNodes: ISLAND_SCENE_RECIPE.terrain.coastline.nodes.length,
    landforms: ISLAND_SCENE_RECIPE.terrain.landforms.length,
    noiseOctaves: ISLAND_SCENE_RECIPE.terrain.noise.octaves,
    budget: TERRAIN_CONTROL_BUDGET,
  };

  // Representation and measurement checks must hold even while the candidate's
  // geography quality is red.
  assert.equal(
    report.semanticSeaLevel.heightExact,
    true,
    "Semantic Sea Level is not the frozen datum",
  );
  assert.equal(report.semanticSeaLevel.normalExact, true, "sea plane normal is not +Y");
  assert.equal(
    report.semanticSeaLevel.allFrustaCovered,
    true,
    "the Ocean Appearance Surface does not cover every frozen camera frustum",
  );

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (checkOnly) {
    const frozen = await readFile(REPORT_PATH, "utf8");
    assert.equal(frozen, serialized, "geography evidence drifted");
  } else {
    await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
    await writeFile(REPORT_PATH, serialized);
  }

  process.stdout.write(
    `Geography: ${report.terrainProgram.coastNodes}/${TERRAIN_CONTROL_BUDGET.coastNodes} coast controls, ` +
      `${report.terrainProgram.landforms}/${TERRAIN_CONTROL_BUDGET.landforms} landforms; ` +
      `height p95 full ${report.height.full.p95} interior ${report.height.interior.p95} shore ${report.height.shore.p95}; ` +
      `coast p95 ${report.coastline.symmetricDistance.p95}, area err ${(report.coastline.areaRelativeError * 100).toFixed(2)}%; ` +
      `classification ${(report.classification.agreementFraction * 100).toFixed(2)}%; ` +
      `inlets ${report.inlets.matched}/${report.inlets.reference}\n`,
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
