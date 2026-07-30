import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  COVERAGE_SCHEMA_VERSION,
  buildSemanticCoverageManifest,
  coverageFailures,
} from "../tools/reconstruction/semantic-coverage.mjs";
import { readAuthoredPlacements } from "../tools/reconstruction/scene-placements.mjs";
import { resolveFamily } from "../tools/reconstruction/scene-families.mjs";
import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const inventory = JSON.parse(
  await readFile(
    path.join(
      PROJECT_ROOT,
      ".scratch/scene-parity-foundation/evidence/scene-inventory-v1.json",
    ),
    "utf8",
  ),
);

test("the frozen manifest classifies every renderable with nothing left over", () => {
  const manifest = buildSemanticCoverageManifest(inventory, ISLAND_SCENE_RECIPE);

  assert.equal(manifest.schemaVersion, COVERAGE_SCHEMA_VERSION);
  assert.deepEqual(coverageFailures(manifest), []);
  assert.equal(manifest.coverage.countFraction, 1);
  assert.equal(manifest.coverage.areaFraction, 1);
  assert.equal(manifest.coverage.pixelFraction, 1);
  const classCount = Object.values(manifest.byClass).reduce(
    (sum, entry) => sum + entry.count,
    0,
  );
  assert.equal(classCount, manifest.totals.renderables);
  assert.equal(manifest.unclassified.length, 0);
});

test("one visible unclassified renderable blocks coverage", () => {
  const damaged = {
    ...inventory,
    items: [
      ...inventory.items,
      {
        path: "/0000:Scene:/0999:Mesh:Unrecognised",
        type: "Mesh",
        visible: true,
        frustumCulled: true,
        instanceCount: 1,
        triangles: 120,
        worldSurfaceArea: 42,
        bounds: { min: [10, 20, 10], max: [16, 26, 16] },
        orientation: { yaw: 0, tilt: 0, worldScale: [1, 1, 1] },
        materials: [],
        overviewPixels: 900,
      },
    ],
  };
  const manifest = buildSemanticCoverageManifest(damaged, ISLAND_SCENE_RECIPE);

  assert.equal(manifest.blocking.visibleUnclassifiedCount, 1);
  assert.ok(
    coverageFailures(manifest).some((failure) => failure.includes("unclassified")),
  );
  assert.ok(manifest.coverage.countFraction < 1);
});

test("a missing or invented Scene Recipe entity blocks coverage", () => {
  const withoutFirst = {
    ...ISLAND_SCENE_RECIPE,
    entities: ISLAND_SCENE_RECIPE.entities.slice(1),
  };
  assert.ok(
    coverageFailures(buildSemanticCoverageManifest(inventory, withoutFirst)).some(
      (failure) => failure.includes("no matching Scene Recipe entity"),
    ),
  );

  const invented = {
    ...ISLAND_SCENE_RECIPE,
    entities: [
      ...ISLAND_SCENE_RECIPE.entities,
      {
        ...ISLAND_SCENE_RECIPE.entities[0],
        semanticId: "rocks/rock-p9999-p0260-p9999",
        anchor: [999.9, 26, 999.9],
      },
    ],
  };
  assert.ok(
    coverageFailures(buildSemanticCoverageManifest(inventory, invented)).some(
      (failure) => failure.includes("no reference evidence"),
    ),
  );
});

test("a displaced or resized entity blocks coverage", () => {
  const displaced = {
    ...ISLAND_SCENE_RECIPE,
    entities: ISLAND_SCENE_RECIPE.entities.map((entity, index) =>
      index === 0
        ? { ...entity, anchor: [entity.anchor[0] + 3, entity.anchor[1], entity.anchor[2]] }
        : entity,
    ),
  };
  assert.ok(
    coverageFailures(buildSemanticCoverageManifest(inventory, displaced)).some(
      (failure) => failure.includes("no matching Scene Recipe entity"),
    ),
  );

  const resized = {
    ...ISLAND_SCENE_RECIPE,
    entities: ISLAND_SCENE_RECIPE.entities.map((entity, index) =>
      index === 0
        ? { ...entity, extent: [entity.extent[0] * 1.5, entity.extent[1], entity.extent[2]] }
        : entity,
    ),
  };
  const manifest = buildSemanticCoverageManifest(inventory, resized);
  assert.ok(
    manifest.identityCorrespondence.failures.some((failure) =>
      failure.failure.includes("Target AABB Extent"),
    ),
  );
});

test("a dropped assembled-scene local light blocks coverage", () => {
  const withoutLight = {
    ...ISLAND_SCENE_RECIPE,
    semanticLights: ISLAND_SCENE_RECIPE.semanticLights.slice(1),
  };
  const manifest = buildSemanticCoverageManifest(inventory, withoutLight);

  assert.equal(manifest.blocking.unmatchedLocalLightCount, 1);
  assert.ok(
    coverageFailures(manifest).some((failure) => failure.includes("Semantic Light")),
  );
});

test("Scene Semantic IDs survive insertion, deletion, and reordering", () => {
  const before = readAuthoredPlacements(inventory).placements.map(
    (placement) => placement.semanticId,
  );

  const reordered = { ...inventory, items: [...inventory.items].reverse() };
  assert.deepEqual(
    readAuthoredPlacements(reordered).placements.map((placement) => placement.semanticId),
    before,
    "regeneration must not renumber identities when traversal order changes",
  );

  const withoutOne = {
    ...inventory,
    items: inventory.items.filter(
      (item) => !item.path.includes("0416:Group:PalmTree__palmtree_5__0001"),
    ),
  };
  const after = readAuthoredPlacements(withoutOne).placements.map(
    (placement) => placement.semanticId,
  );
  assert.equal(after.length, before.length - 1);
  assert.deepEqual(
    after,
    before.filter((id) => after.includes(id)),
    "deleting one placement must leave every other identity unchanged",
  );
});

test("an unmapped authored family is a blocking coverage failure, not a silent drop", () => {
  assert.throws(
    () => resolveFamily("Some_New_Authored_Family", [1, 1, 1]),
    /unmapped authored family/,
  );
});

test("the Scene Recipe carries no reference path, node identifier, or family name", () => {
  const serialized = JSON.stringify(ISLAND_SCENE_RECIPE);

  for (const forbidden of [
    "Authored_Village",
    "PalmTree",
    "CherryBlossom",
    "_fbx",
    "MeshPart",
    "_Rig",
    "mesh_m",
  ]) {
    assert.ok(
      !serialized.includes(forbidden),
      `the Scene Recipe leaked the reference identifier ${forbidden}`,
    );
  }
});
