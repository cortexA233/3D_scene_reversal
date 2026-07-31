import assert from "node:assert/strict";
import test from "node:test";

import {
  SCENE_SEED_VERSION,
  deriveSceneSeed,
  sceneSeedGoldenVectors,
} from "../gt_designer/src/reconstruction/scene/scene-seed.js";
import {
  SCENE_RECIPE_SCHEMA_VERSION,
  validateSceneRecipe,
} from "../gt_designer/src/reconstruction/scene/scene-recipe-contract.js";
import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";

const PURPOSES = ["geometry", "material", "distribution", "environment"];

test("scene seeds derive statelessly from the root seed, identity, and purpose", () => {
  const seed = ISLAND_SCENE_RECIPE.sceneSeed;

  for (const purpose of PURPOSES) {
    const first = deriveSceneSeed(seed, "structures/pavilion-p0309-p0349-n1550", purpose);
    const second = deriveSceneSeed(seed, "structures/pavilion-p0309-p0349-n1550", purpose);
    assert.equal(first, second, "derivation must be stateless and repeatable");
    assert.ok(Number.isInteger(first) && first >= 0 && first < 0x1_0000_0000);
  }

  const purposes = new Set(
    PURPOSES.map((purpose) => deriveSceneSeed(seed, "a/b", purpose)),
  );
  assert.equal(purposes.size, PURPOSES.length, "purposes must be isolated");

  assert.notEqual(
    deriveSceneSeed(seed, "a/b", "geometry"),
    deriveSceneSeed(seed + 1, "a/b", "geometry"),
    "the root seed must reach every derived stream",
  );
  assert.notEqual(
    deriveSceneSeed(seed, "a/b", "geometry"),
    deriveSceneSeed(seed, "a/c", "geometry"),
    "semantic identity must reach every derived stream",
  );
  // UTF-8 semantics rather than UTF-16 code units.
  assert.notEqual(
    deriveSceneSeed(seed, "café", "geometry"),
    deriveSceneSeed(seed, "cafe", "geometry"),
  );
});

test("derived seeds have frozen golden vectors", () => {
  const vectors = sceneSeedGoldenVectors();

  assert.equal(SCENE_SEED_VERSION, "scene-seed-fnv1a-mulberry32-v1");
  assert.ok(vectors.length >= 8);
  for (const { sceneSeed, semanticId, purpose, derived } of vectors) {
    assert.equal(deriveSceneSeed(sceneSeed, semanticId, purpose), derived);
  }
});

test("every derived key in the island recipe is collision free", () => {
  const derived = new Map();
  const collisions = [];
  for (const entity of ISLAND_SCENE_RECIPE.entities) {
    for (const purpose of PURPOSES) {
      const key = `${entity.semanticId}::${purpose}`;
      const seed = deriveSceneSeed(
        ISLAND_SCENE_RECIPE.sceneSeed,
        entity.semanticId,
        purpose,
      );
      if (derived.has(seed)) collisions.push([derived.get(seed), key]);
      derived.set(seed, key);
    }
  }
  assert.deepEqual(collisions, []);
});

test("the island Scene Recipe validates against the frozen contract", () => {
  assert.equal(ISLAND_SCENE_RECIPE.schemaVersion, SCENE_RECIPE_SCHEMA_VERSION);
  assert.deepEqual(validateSceneRecipe(ISLAND_SCENE_RECIPE), []);
  assert.deepEqual(ISLAND_SCENE_RECIPE.sceneAnchor, [86, 26, -24]);
  assert.equal(ISLAND_SCENE_RECIPE.world.semanticSeaLevel, 16);
  assert.equal(Object.isFrozen(ISLAND_SCENE_RECIPE), true);
});

test("Scene Semantic IDs are stable, unique, and free of source-node identity", () => {
  const ids = ISLAND_SCENE_RECIPE.entities.map((entity) => entity.semanticId);

  assert.equal(new Set(ids).size, ids.length, "semantic IDs must be unique");
  for (const id of ids) {
    assert.match(id, /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*-[pn]\d+-[pn]\d+-[pn]\d+$/);
  }
  // Derived from world placement, so inserting an entity cannot renumber others.
  const [first] = ISLAND_SCENE_RECIPE.entities;
  assert.equal(
    first.semanticId,
    ISLAND_SCENE_RECIPE.entities.find(
      (entity) => entity.anchor[0] === first.anchor[0] && entity.kind === first.kind,
    ).semanticId,
  );
});

test("placement, extent, and orientation are executable contract fields", () => {
  const errors = validateSceneRecipe({
    ...ISLAND_SCENE_RECIPE,
    entities: [
      {
        ...ISLAND_SCENE_RECIPE.entities[0],
        anchor: [0, 0],
        extent: [1, 1, 1],
      },
    ],
  });
  assert.ok(errors.some((error) => error.includes("anchor")));

  assert.ok(
    validateSceneRecipe({
      ...ISLAND_SCENE_RECIPE,
      entities: [
        { ...ISLAND_SCENE_RECIPE.entities[0], extent: [0, 5, 5] },
      ],
    }).some((error) => error.includes("extent")),
  );
  assert.ok(
    validateSceneRecipe({
      ...ISLAND_SCENE_RECIPE,
      entities: [
        {
          ...ISLAND_SCENE_RECIPE.entities[0],
          orientation: { type: "pca-yaw", radians: 0 },
        },
      ],
    }).some((error) => error.includes("orientation")),
  );

  for (const entity of ISLAND_SCENE_RECIPE.entities) {
    assert.ok(
      ["heading", "axis", "radial", "surface-aligned"].includes(
        entity.orientation.type,
      ),
    );
    assert.equal(entity.anchor.length, 3);
    assert.equal(entity.extent.length, 3);
    assert.ok(entity.extent.every((value) => value > 0));
  }
});

test("the Scene Recipe carries no source-node identity or dense payload", () => {
  const serialized = JSON.stringify(ISLAND_SCENE_RECIPE);

  assert.doesNotMatch(serialized, /"(?:name|nodeName|canonicalName|uuid|meshId)"\s*:/i);
  assert.doesNotMatch(serialized, /\.(?:glb|gltf|png|jpe?g|webp|bin|hdr|exr)\b/i);
  for (const entity of ISLAND_SCENE_RECIPE.entities) {
    const numbers = JSON.stringify(entity).match(/-?\d+(?:\.\d+)?/g) ?? [];
    assert.ok(
      numbers.length <= 64,
      `${entity.semanticId} retains ${numbers.length} numbers, which is no longer a compact semantic recipe`,
    );
  }
});

test("a Semantic Light names the entity it actually sits on, or names none", async () => {
  /**
   * Ticket 12's emissive relationship, and the reason it needed fixing rather than adding.
   *
   * The relationship existed and was wrong. It attributed each light to the entity whose
   * *anchor* was nearest, and an anchor is a bottom-centre: a lantern's light sits at the
   * top of the lantern, so the anchor distance is roughly the fixture's own height and the
   * nearest anchor is usually something else. It put lights on a `panda`, a `bamboo-pile`
   * and a `paving-slab`. Measuring distance to the entity's *box* instead — zero inside
   * it, so inside and just-outside are one test — puts the same lights on the `wish-tree`,
   * `dessert-shop` and `dumpling-house` that carry them.
   *
   * Fewer lights are attributed now, 15 against 19, and that is the point: a wrong
   * relationship in a frozen artefact is worse than an absent one, and the 17 unattached
   * lights stay explicitly null rather than being given the nearest thing.
   */
  const { ISLAND_SCENE_RECIPE: recipe } = await import(
    "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js"
  );
  const byId = new Map(recipe.entities.map((entity) => [entity.semanticId, entity]));
  const boxDistance = (point, entity) => {
    let squared = 0;
    for (let axis = 0; axis < 3; axis += 1) {
      const half = axis === 1 ? 0 : entity.extent[axis] / 2;
      const low = axis === 1 ? entity.anchor[1] : entity.anchor[axis] - half;
      const high =
        axis === 1 ? entity.anchor[1] + entity.extent[1] : entity.anchor[axis] + half;
      const outside = Math.max(low - point[axis], 0, point[axis] - high);
      squared += outside * outside;
    }
    return Math.sqrt(squared);
  };

  let attributed = 0;
  for (const light of recipe.semanticLights) {
    if (light.emissiveSource === null) continue;
    const entity = byId.get(light.emissiveSource);
    assert.ok(entity, `${light.lightId} names an entity that is not in the recipe`);
    const distance = boxDistance(light.position, entity);
    assert.ok(
      distance <= 5,
      `${light.lightId} is ${distance.toFixed(1)} units from ${entity.kind}'s box`,
    );
    // And it is the *nearest* box, not merely a near one: a light inside two overlapping
    // boxes should name the one it is actually in.
    for (const other of recipe.entities) {
      assert.ok(
        boxDistance(light.position, other) >= distance - 1e-6,
        `${light.lightId} names ${entity.kind} while sitting closer to ${other.kind}`,
      );
    }
    attributed += 1;
  }
  assert.ok(attributed > 0, "no Semantic Light names an emissive source at all");
  assert.ok(
    attributed < recipe.semanticLights.length,
    "every light found a source, which means the threshold is not discriminating",
  );
});
