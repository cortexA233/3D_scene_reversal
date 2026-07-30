import * as THREE from "three";

import { createSeededRng } from "../core/rng.js";
import {
  SCENE_SEED_PURPOSES,
  validateSceneRecipe,
} from "./scene-recipe-contract.js";
import { deriveSceneSeed } from "./scene-seed.js";
import {
  generateSceneObject,
  hasSceneGeneratorKind,
} from "./scene-object-generators.js";
import { generateTerrain } from "./terrain-generator.js";
import { createMaterialFamilies } from "./material-families.js";

export const SCENE_GENERATOR_VERSION = "island-scene-generator-v1";

/** How exactly a generated entity must land on its declared contract. */
export const PLACEMENT_TOLERANCE = Object.freeze({
  anchor: 1e-4,
  extentRelative: 1e-3,
});

function boundsOf(object) {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

/**
 * Place one entity so its complete generated AABB bottom-center is exactly the
 * Scene Placement Anchor and its world-axis-aligned bounds are exactly the
 * Target AABB Extent.
 *
 * The transform chain is `anchor · extent · orientation · localForm`. Because
 * the extent scale sits outside the rotation, it acts on world axes, so the
 * declared extent is a hard output target rather than a generator hint, and it
 * cannot be reinterpreted as an empirical shrink factor.
 */
function placeEntity(entity, form) {
  // Directed `heading` uses local +Z as forward with right-handed rotation about
  // world +Y. Undirected `axis` generates the same way and is compared modulo
  // 180 degrees by evaluation. `radial` has no yaw at all.
  const oriented = new THREE.Group();
  oriented.add(form);
  if (entity.orientation.type !== "radial") {
    oriented.rotation.y = entity.orientation.radians;
  }
  oriented.updateMatrixWorld(true);
  const rotated = new THREE.Box3().setFromObject(oriented);
  const rotatedSize = rotated.getSize(new THREE.Vector3());
  const rotatedCenter = rotated.getCenter(new THREE.Vector3());
  // Re-seat the rotated form on its own AABB bottom-center.
  oriented.position.set(-rotatedCenter.x, -rotated.min.y, -rotatedCenter.z);

  const scaled = new THREE.Group();
  scaled.add(oriented);
  scaled.scale.set(
    entity.extent[0] / rotatedSize.x,
    entity.extent[1] / rotatedSize.y,
    entity.extent[2] / rotatedSize.z,
  );

  const holder = new THREE.Group();
  holder.add(scaled);
  holder.position.set(entity.anchor[0], entity.anchor[1], entity.anchor[2]);
  holder.userData.semanticId = entity.semanticId;
  holder.userData.semanticKind = entity.kind;
  holder.userData.semanticGroup = entity.group;
  holder.userData.materialFamily = entity.materialFamily;
  return holder;
}

function contractErrorsFor(entity, holder) {
  const errors = [];
  const bounds = boundsOf(holder);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const anchor = [center.x, bounds.min.y, center.z];
  anchor.forEach((value, axis) => {
    const delta = Math.abs(value - entity.anchor[axis]);
    if (delta > PLACEMENT_TOLERANCE.anchor) {
      errors.push(
        `${entity.semanticId}: Scene Placement Anchor axis ${axis} is off by ${delta.toFixed(6)}`,
      );
    }
  });
  const generated = [size.x, size.y, size.z];
  generated.forEach((value, axis) => {
    const relative = Math.abs(value - entity.extent[axis]) / entity.extent[axis];
    if (relative > PLACEMENT_TOLERANCE.extentRelative) {
      errors.push(
        `${entity.semanticId}: Target AABB Extent axis ${axis} is off by ${(relative * 100).toFixed(3)}%`,
      );
    }
  });
  return errors;
}

function derivedSeeds(recipe, semanticId) {
  return Object.fromEntries(
    SCENE_SEED_PURPOSES.map((purpose) => [
      purpose,
      deriveSceneSeed(recipe.sceneSeed, semanticId, purpose),
    ]),
  );
}

function buildEnvironment(recipe, materials) {
  const { environment } = recipe;
  const root = new THREE.Group();
  root.userData.semanticId = "environment";

  const sunElevation = (environment.sun.elevationDegrees * Math.PI) / 180;
  const sunAzimuth = (environment.sun.azimuthDegrees * Math.PI) / 180;
  const sunDistance = 2400;
  const sun = new THREE.DirectionalLight(
    environment.sun.color,
    environment.sun.intensity,
  );
  sun.position.set(
    Math.cos(sunElevation) * Math.cos(sunAzimuth) * sunDistance,
    Math.sin(sunElevation) * sunDistance,
    Math.cos(sunElevation) * Math.sin(sunAzimuth) * sunDistance,
  );
  sun.castShadow = environment.sun.castShadow;
  sun.shadow.mapSize.set(...environment.sun.shadowMapSize);
  sun.shadow.bias = environment.sun.shadowBias;
  sun.userData.semanticId = "environment/sun";
  root.add(sun);

  const hemisphere = new THREE.HemisphereLight(
    environment.hemisphere.sky,
    environment.hemisphere.ground,
    environment.hemisphere.intensity,
  );
  hemisphere.userData.semanticId = "environment/hemisphere";
  root.add(hemisphere);

  const ambient = new THREE.AmbientLight(
    environment.ambient.color,
    environment.ambient.intensity,
  );
  ambient.userData.semanticId = "environment/ambient";
  root.add(ambient);

  // The dome's radius is a recipe parameter, and its glow needs the sun direction
  // the sun light already uses, so the two cannot drift apart.
  const sunDirection = [
    Math.cos(sunElevation) * Math.cos(sunAzimuth),
    Math.sin(sunElevation),
    Math.cos(sunElevation) * Math.sin(sunAzimuth),
  ];
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(environment.sky.radius, 48, 24),
    materials.sky(environment.sky, sunDirection),
  );
  // The authored dome is never culled: it is larger than the far plane at some
  // framings, and a culled backdrop leaves the clear colour showing through.
  sky.frustumCulled = false;
  sky.userData.semanticId = "environment/sky";
  root.add(sky);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(environment.ocean.extent, environment.ocean.extent, 1, 1),
    materials.ocean(environment.ocean, environment.sky, sunDirection),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = recipe.world.semanticSeaLevel;
  ocean.userData.semanticId = "environment/ocean-appearance-surface";
  root.add(ocean);

  return root;
}

function buildPopulations(recipe, materials, elevationAt) {
  const root = new THREE.Group();
  root.userData.semanticId = "cover";

  for (const population of recipe.populations) {
    const rng = createSeededRng(
      deriveSceneSeed(recipe.sceneSeed, population.coverId, "distribution"),
    );
    const geometry =
      population.kind === "cloud"
        ? new THREE.SphereGeometry(1, 6, 5)
        : population.kind === "grass-tuft"
          ? new THREE.ConeGeometry(1, 2, 4)
          : new THREE.IcosahedronGeometry(1, 0);
    const material = materials.family(population.materialFamily);
    const mesh = new THREE.InstancedMesh(geometry, material, population.count);
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < population.count; index += 1) {
      const angle = rng.nextFloat() * Math.PI * 2;
      const radial =
        population.region.innerRadius +
        rng.nextFloat() *
          (population.region.outerRadius - population.region.innerRadius);
      const scale =
        population.scaleRange[0] +
        rng.nextFloat() * (population.scaleRange[1] - population.scaleRange[0]);
      // Populations are placed inside their own measured region and settled on
      // the generated terrain rather than on a flat nominal ground plane.
      const x = population.region.center[0] + Math.cos(angle) * radial * population.region.radii[0];
      const z = population.region.center[1] + Math.sin(angle) * radial * population.region.radii[1];
      const y =
        population.region.shape === "sky-shell"
          ? population.region.minHeight +
            rng.nextFloat() *
              (population.region.maxHeight - population.region.minHeight)
          : elevationAt(x, z);
      matrix.makeRotationY(rng.nextFloat() * Math.PI * 2);
      matrix.scale(new THREE.Vector3(scale, scale, scale));
      matrix.setPosition(x, y, z);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.semanticId = population.coverId;
    mesh.userData.coverCount = population.count;
    root.add(mesh);
  }
  return root;
}

function buildSemanticLights(recipe) {
  const root = new THREE.Group();
  root.userData.semanticId = "lights";
  for (const light of recipe.semanticLights) {
    const point = new THREE.PointLight(
      new THREE.Color(light.color[0], light.color[1], light.color[2]),
      light.intensity,
      light.range,
    );
    point.position.set(...light.position);
    point.castShadow = light.castShadow;
    point.userData.semanticId = light.lightId;
    point.userData.emissiveSource = light.emissiveSource;
    root.add(point);
  }
  return root;
}

/**
 * The production Scene Generation Module: one Scene Recipe in, the complete
 * generated scene plus a stable semantic index out. It owns world composition;
 * Object Generators own only local shape.
 *
 * @param {object} recipe
 * @param {{ validate?: boolean }} [options]
 */
export function generateScene(recipe, options = {}) {
  const recipeErrors = validateSceneRecipe(recipe);
  if (recipeErrors.length > 0) {
    throw new Error(`invalid Scene Recipe:\n- ${recipeErrors.join("\n- ")}`);
  }

  const materials = createMaterialFamilies(recipe);
  const root = new THREE.Group();
  root.userData.semanticId = "island";
  root.userData.generatorVersion = SCENE_GENERATOR_VERSION;
  root.userData.recipeVersion = recipe.schemaVersion;
  root.userData.sceneSeed = recipe.sceneSeed;

  const semanticIndex = new Map();
  const contractErrors = [];

  const terrain = generateTerrain(recipe, materials);
  root.add(terrain);
  semanticIndex.set(terrain.userData.semanticId, {
    object: terrain,
    kind: "terrain",
    group: "geography",
  });

  const entityRoot = new THREE.Group();
  entityRoot.userData.semanticId = "entities";
  for (const entity of recipe.entities) {
    if (!hasSceneGeneratorKind(entity.kind)) {
      contractErrors.push(`${entity.semanticId}: no generator for kind ${entity.kind}`);
      continue;
    }
    const seeds = derivedSeeds(recipe, entity.semanticId);
    const form = generateSceneObject(entity.kind, seeds.geometry, entity.shape);
    materials.apply(form, entity.materialFamily, seeds.material);
    const holder = placeEntity(entity, form);
    contractErrors.push(...contractErrorsFor(entity, holder));
    entityRoot.add(holder);
    semanticIndex.set(entity.semanticId, {
      object: holder,
      kind: entity.kind,
      group: entity.group,
      anchor: entity.anchor,
      extent: entity.extent,
      orientation: entity.orientation,
      materialFamily: entity.materialFamily,
      seeds,
    });
  }
  root.add(entityRoot);

  const environment = buildEnvironment(recipe, materials);
  root.add(environment);
  const populations = buildPopulations(recipe, materials, terrain.userData.elevationAt);
  root.add(populations);
  for (const cover of populations.children) {
    semanticIndex.set(cover.userData.semanticId, {
      object: cover,
      kind: "distributed-cover",
      group: "cover",
      count: cover.userData.coverCount,
    });
  }
  const lights = buildSemanticLights(recipe);
  root.add(lights);
  for (const light of lights.children) {
    semanticIndex.set(light.userData.semanticId, {
      object: light,
      kind: "semantic-light",
      group: "lights",
      emissiveSource: light.userData.emissiveSource,
    });
  }

  if (options.validate !== false && contractErrors.length > 0) {
    throw new Error(
      `generated scene violated its placement contract:\n- ${contractErrors.slice(0, 12).join("\n- ")}`,
    );
  }

  return {
    root,
    semanticIndex,
    environment: recipe.environment,
    report: {
      generatorVersion: SCENE_GENERATOR_VERSION,
      recipeVersion: recipe.schemaVersion,
      rngVersion: recipe.rngVersion,
      seedVersion: recipe.seedVersion,
      sceneSeed: recipe.sceneSeed,
      entityCount: recipe.entities.length,
      populationCount: recipe.populations.length,
      semanticLightCount: recipe.semanticLights.length,
      semanticIdCount: semanticIndex.size,
      contractErrors,
    },
  };
}
