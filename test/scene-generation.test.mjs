import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import * as THREE from "three";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import {
  PLACEMENT_TOLERANCE,
  SCENE_GENERATOR_VERSION,
  generateScene,
} from "../gt_designer/src/reconstruction/scene/scene-generator.js";
import { generateSceneObject } from "../gt_designer/src/reconstruction/scene/scene-object-generators.js";
import { deriveSceneSeed } from "../gt_designer/src/reconstruction/scene/scene-seed.js";

function boundsOf(object) {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

function boundsArray(object) {
  const bounds = boundsOf(object);
  return [...bounds.min.toArray(), ...bounds.max.toArray()];
}

let cached = null;
function scene() {
  if (!cached) cached = generateScene(ISLAND_SCENE_RECIPE);
  return cached;
}

test("the Scene Generation Module returns a scene and a stable semantic index", () => {
  const { root, semanticIndex, report } = scene();

  assert.equal(report.generatorVersion, SCENE_GENERATOR_VERSION);
  assert.deepEqual(report.contractErrors, []);
  assert.equal(report.entityCount, ISLAND_SCENE_RECIPE.entities.length);
  assert.ok(root.isObject3D);
  for (const entity of ISLAND_SCENE_RECIPE.entities) {
    assert.ok(semanticIndex.has(entity.semanticId), `${entity.semanticId} is missing`);
  }
  for (const population of ISLAND_SCENE_RECIPE.populations) {
    assert.ok(semanticIndex.has(population.coverId));
  }
  assert.equal(
    semanticIndex.size,
    ISLAND_SCENE_RECIPE.entities.length +
      ISLAND_SCENE_RECIPE.populations.length +
      ISLAND_SCENE_RECIPE.semanticLights.length +
      1,
  );
});

test("every entity lands exactly on its anchor with its Target AABB Extent", () => {
  const { semanticIndex } = scene();

  for (const entity of ISLAND_SCENE_RECIPE.entities) {
    const bounds = boundsOf(semanticIndex.get(entity.semanticId).object);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const anchor = [center.x, bounds.min.y, center.z];
    anchor.forEach((value, axis) => {
      assert.ok(
        Math.abs(value - entity.anchor[axis]) <= PLACEMENT_TOLERANCE.anchor,
        `${entity.semanticId} anchor axis ${axis}: ${value} vs ${entity.anchor[axis]}`,
      );
    });
    [size.x, size.y, size.z].forEach((value, axis) => {
      const relative = Math.abs(value - entity.extent[axis]) / entity.extent[axis];
      assert.ok(
        relative <= PLACEMENT_TOLERANCE.extentRelative,
        `${entity.semanticId} extent axis ${axis}: ${value} vs ${entity.extent[axis]}`,
      );
    });
  }
});

test("no semantic group carries a transform that moves its children", () => {
  const { root } = scene();

  root.traverse((object) => {
    if (object.userData.semanticId && object.children.length > 0 && !object.userData.semanticKind) {
      assert.ok(
        object.position.lengthSq() === 0 &&
          object.rotation.x === 0 &&
          object.rotation.y === 0 &&
          object.rotation.z === 0 &&
          object.scale.x === 1 &&
          object.scale.y === 1 &&
          object.scale.z === 1,
        `${object.userData.semanticId} is a semantic group with a hidden transform`,
      );
    }
  });
});

function geometryDigest(object) {
  object.updateMatrixWorld(true);
  const hash = createHash("sha256");
  object.traverse((child) => {
    if (!child.isMesh) return;
    hash.update(child.userData.semanticPart ?? "");
    hash.update(new Float32Array(child.matrixWorld.elements));
    hash.update(child.geometry.attributes.position.array);
  });
  return hash.digest("hex");
}

test("Object Generators work only in the local Reconstruction Frame", () => {
  const first = generateSceneObject("mountain", 12345);
  const bounds = boundsOf(first);
  const center = bounds.getCenter(new THREE.Vector3());

  assert.ok(Math.abs(center.x) <= 1e-6 && Math.abs(center.z) <= 1e-6);
  assert.ok(Math.abs(bounds.min.y) <= 1e-6);
  assert.equal(
    geometryDigest(generateSceneObject("mountain", 12345)),
    geometryDigest(first),
    "the same derived seed must produce identical CPU geometry",
  );
  assert.notEqual(
    geometryDigest(generateSceneObject("mountain", 999)),
    geometryDigest(first),
    "a different derived seed must reach the generated form",
  );
});

test("generation is deterministic and isolated per entity", () => {
  const first = generateScene(ISLAND_SCENE_RECIPE);
  const second = generateScene(ISLAND_SCENE_RECIPE);

  for (const entity of ISLAND_SCENE_RECIPE.entities.slice(0, 40)) {
    assert.deepEqual(
      boundsArray(first.semanticIndex.get(entity.semanticId).object),
      boundsArray(second.semanticIndex.get(entity.semanticId).object),
    );
  }

  // Inserting an entity must not perturb any other entity's derived streams.
  const inserted = {
    ...ISLAND_SCENE_RECIPE,
    entities: [
      {
        semanticId: "rocks/rock-p9999-p0260-p9999",
        kind: "rock",
        group: "rocks",
        anchor: [999.9, 26, 999.9],
        extent: [4, 3, 4],
        orientation: { type: "axis", radians: 0 },
        materialFamily: "shore-rock",
      },
      ...ISLAND_SCENE_RECIPE.entities,
    ],
  };
  const perturbed = generateScene(inserted);
  for (const entity of ISLAND_SCENE_RECIPE.entities.slice(0, 40)) {
    assert.deepEqual(
      boundsArray(perturbed.semanticIndex.get(entity.semanticId).object),
      boundsArray(first.semanticIndex.get(entity.semanticId).object),
      `${entity.semanticId} drifted when an unrelated entity was inserted`,
    );
    assert.deepEqual(
      perturbed.semanticIndex.get(entity.semanticId).seeds,
      first.semanticIndex.get(entity.semanticId).seeds,
    );
  }
});

test("a hidden placement correction is rejected rather than silently applied", () => {
  const damaged = {
    ...ISLAND_SCENE_RECIPE,
    entities: ISLAND_SCENE_RECIPE.entities.map((entity, index) =>
      index === 0 ? { ...entity, extent: [entity.extent[0] * 1.4, entity.extent[1], entity.extent[2]] } : entity,
    ),
  };
  // The generator must reach the declared extent exactly, so a changed target
  // changes the output rather than being absorbed by an empirical factor.
  const regenerated = generateScene(damaged);
  const size = boundsOf(
    regenerated.semanticIndex.get(damaged.entities[0].semanticId).object,
  ).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - damaged.entities[0].extent[0]) <= 1e-3);

  assert.throws(
    () =>
      generateScene({
        ...ISLAND_SCENE_RECIPE,
        entities: [{ ...ISLAND_SCENE_RECIPE.entities[0], kind: "not-a-kind" }],
      }),
    /invalid Scene Recipe|no generator for kind/,
  );
});

test("derived seeds reach every entity through the semantic index", () => {
  const { semanticIndex } = scene();

  for (const entity of ISLAND_SCENE_RECIPE.entities.slice(0, 20)) {
    const record = semanticIndex.get(entity.semanticId);
    assert.equal(
      record.seeds.geometry,
      deriveSceneSeed(ISLAND_SCENE_RECIPE.sceneSeed, entity.semanticId, "geometry"),
    );
    assert.notEqual(record.seeds.geometry, record.seeds.material);
  }
});
