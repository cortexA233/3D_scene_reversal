/**
 * Scene Recipe contract.
 *
 * The Scene Recipe is the only production-safe scene-specific artifact. It
 * carries executable references, deterministic seed state, and compact Semantic
 * Measurements whose size is independent of source mesh, texture, and evaluation
 * resolution. Validation runs before generation so a malformed placement,
 * extent, or orientation fails loudly instead of being reinterpreted by a
 * generator.
 */

import { validateTerrainProgram } from "./terrain-program.js";

export const SCENE_RECIPE_SCHEMA_VERSION = "island-scene-recipe-v1";

export const SCENE_ORIENTATION_TYPES = Object.freeze([
  "heading",
  "axis",
  "radial",
  "surface-aligned",
]);

/** Isolated random streams every entity may request. */
export const SCENE_SEED_PURPOSES = Object.freeze([
  "geometry",
  "material",
  "distribution",
  "environment",
]);

const SEMANTIC_ID_PATTERN = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*-[pn]\d+-[pn]\d+-[pn]\d+$/;
const GROUP_PATTERN = /^[a-z][a-z0-9-]*$/;
const UINT32_RANGE = 0x1_0000_0000;

function isVector3(value) {
  return (
    Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
  );
}

function validateOrientation(orientation, label, errors) {
  if (!orientation || typeof orientation !== "object") {
    errors.push(`${label}: orientation is missing`);
    return;
  }
  if (!SCENE_ORIENTATION_TYPES.includes(orientation.type)) {
    errors.push(
      `${label}: orientation type ${JSON.stringify(orientation.type)} is not a declared Scene Orientation`,
    );
    return;
  }
  if (orientation.type === "radial") {
    if ("radians" in orientation) {
      errors.push(`${label}: radial orientation has no yaw`);
    }
    return;
  }
  if (!Number.isFinite(orientation.radians)) {
    errors.push(`${label}: orientation radians must be finite`);
  }
  if (orientation.type === "surface-aligned" && !isVector3(orientation.supportNormal)) {
    errors.push(`${label}: surface-aligned orientation needs a support normal`);
  }
}

function validateEntity(entity, index, seen, errors) {
  const label = `entity[${index}] ${entity?.semanticId ?? "<unnamed>"}`;
  if (typeof entity?.semanticId !== "string" || !SEMANTIC_ID_PATTERN.test(entity.semanticId)) {
    errors.push(`${label}: semanticId must be <group>/<kind>-<x>-<y>-<z> in world placement form`);
  } else if (seen.has(entity.semanticId)) {
    errors.push(`${label}: duplicate Scene Semantic ID`);
  } else {
    seen.add(entity.semanticId);
  }
  if (typeof entity?.kind !== "string" || !GROUP_PATTERN.test(entity.kind)) {
    errors.push(`${label}: kind must be a lowercase generator kind`);
  }
  if (!isVector3(entity?.anchor)) {
    errors.push(`${label}: anchor must be the world-space AABB bottom-center [x,y,z]`);
  }
  if (!isVector3(entity?.extent) || entity.extent.some((value) => value <= 0)) {
    errors.push(`${label}: extent must be a positive Target AABB Extent [w,h,d]`);
  }
  validateOrientation(entity?.orientation, label, errors);
  if (typeof entity?.materialFamily !== "string" || !GROUP_PATTERN.test(entity.materialFamily)) {
    errors.push(`${label}: materialFamily must reference a declared Material Family`);
  }
  if (entity?.shape !== undefined && (entity.shape === null || typeof entity.shape !== "object")) {
    errors.push(`${label}: shape must be a compact semantic object when present`);
  }
  if ("position" in (entity ?? {}) || "size" in (entity ?? {}) || "yaw" in (entity ?? {})) {
    errors.push(
      `${label}: ambiguous position/size/yaw fields are replaced by anchor, extent, and typed orientation`,
    );
  }
  if ("scale" in (entity ?? {})) {
    errors.push(`${label}: extent is the hard output target, so no scale hint is permitted`);
  }
}

function validatePopulation(population, index, seen, errors) {
  const label = `population[${index}] ${population?.coverId ?? "<unnamed>"}`;
  if (typeof population?.coverId !== "string" || !/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test(population.coverId)) {
    errors.push(`${label}: coverId must be <group>/<cover>`);
  } else if (seen.has(population.coverId)) {
    errors.push(`${label}: duplicate Distributed Scene Cover identity`);
  } else {
    seen.add(population.coverId);
  }
  if (typeof population?.kind !== "string" || !GROUP_PATTERN.test(population.kind)) {
    errors.push(`${label}: kind must be a lowercase population generator kind`);
  }
  if (!Number.isFinite(population?.count) || population.count <= 0) {
    errors.push(`${label}: count must be a positive number`);
  }
  if (!population?.region || typeof population.region !== "object") {
    errors.push(`${label}: region must describe where the cover is distributed`);
  }
  // The distribution controls, required rather than optional.
  //
  // Every one of them was invented before it was measured, and twice the invented
  // value was wrong in a way no aggregate could show: a hardcoded `[0.6, 1.6]`
  // scale for every population, then a range whose root-mean-square matched a
  // measured surface area while its shape stayed a guess. A scatter's rendered
  // size is set by the shape of its size distribution, not by the total area, so
  // the ladder's exponent and the sink are part of the contract and a recipe
  // without them is rejected rather than defaulted.
  const range = population?.scaleRange;
  if (
    !Array.isArray(range) ||
    range.length !== 2 ||
    !range.every((value) => Number.isFinite(value) && value > 0) ||
    range[0] > range[1]
  ) {
    errors.push(`${label}: scaleRange must be an ascending pair of positive measured scales`);
  }
  if (!Number.isFinite(population?.scaleExponent) || population.scaleExponent <= 0) {
    errors.push(`${label}: scaleExponent must be the measured shape of the size ladder`);
  }
  if (!Number.isFinite(population?.sinkFraction)) {
    errors.push(`${label}: sinkFraction must be the measured sink as a fraction of scale`);
  }
  const extent = population?.form?.extent;
  if (
    !Array.isArray(extent) ||
    extent.length !== 3 ||
    !extent.every((value) => Number.isFinite(value) && value >= 0) ||
    extent.every((value) => value === 0)
  ) {
    errors.push(`${label}: form.extent must be the authored unit form's measured extent`);
  }
  if (!Number.isFinite(population?.form?.originHeight)) {
    errors.push(`${label}: form.originHeight must say where the authored form's origin sits`);
  }
}

export function validateSceneRecipe(recipe) {
  const errors = [];
  if (recipe?.schemaVersion !== SCENE_RECIPE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCENE_RECIPE_SCHEMA_VERSION}`);
  }
  if (typeof recipe?.generatorVersion !== "string" || recipe.generatorVersion === "") {
    errors.push("generatorVersion is required");
  }
  if (typeof recipe?.rngVersion !== "string" || recipe.rngVersion === "") {
    errors.push("rngVersion is required");
  }
  if (typeof recipe?.seedVersion !== "string" || recipe.seedVersion === "") {
    errors.push("seedVersion is required");
  }
  if (
    !Number.isInteger(recipe?.sceneSeed) ||
    recipe.sceneSeed < 0 ||
    recipe.sceneSeed >= UINT32_RANGE
  ) {
    errors.push("sceneSeed must be one unsigned 32-bit root seed");
  }
  if (JSON.stringify(recipe?.sceneAnchor) !== JSON.stringify([86, 26, -24])) {
    errors.push("sceneAnchor must be the frozen island datum [86,26,-24]");
  }
  if (recipe?.world?.semanticSeaLevel !== 16) {
    errors.push("world.semanticSeaLevel must be the frozen datum 16");
  }
  if (JSON.stringify(recipe?.world?.seaLevelNormal) !== JSON.stringify([0, 1, 0])) {
    errors.push("world.seaLevelNormal must be +Y");
  }
  if (!recipe?.environment || typeof recipe.environment !== "object") {
    errors.push("environment recipe is required");
  }
  if (!recipe?.terrain || typeof recipe.terrain !== "object") {
    errors.push("terrain program is required");
  } else {
    errors.push(...validateTerrainProgram(recipe.terrain));
  }
  if (!Array.isArray(recipe?.materialFamilies) || recipe.materialFamilies.length === 0) {
    errors.push("materialFamilies must declare at least one family");
  }

  const families = new Set(
    (Array.isArray(recipe?.materialFamilies) ? recipe.materialFamilies : []).map(
      (family) => family?.id,
    ),
  );
  if (!Array.isArray(recipe?.entities) || recipe.entities.length === 0) {
    errors.push("entities must contain the identity-bearing scene entities");
  } else {
    const seen = new Set();
    recipe.entities.forEach((entity, index) => {
      validateEntity(entity, index, seen, errors);
      if (typeof entity?.materialFamily === "string" && !families.has(entity.materialFamily)) {
        errors.push(
          `entity[${index}] ${entity.semanticId}: materialFamily ${entity.materialFamily} is not declared`,
        );
      }
    });
  }

  if (recipe?.populations !== undefined) {
    if (!Array.isArray(recipe.populations)) {
      errors.push("populations must be an array when present");
    } else {
      const seen = new Set();
      recipe.populations.forEach((population, index) =>
        validatePopulation(population, index, seen, errors),
      );
    }
  }

  if (Array.isArray(recipe?.semanticLights)) {
    const entityIds = new Set(
      (Array.isArray(recipe?.entities) ? recipe.entities : []).map(
        (entity) => entity?.semanticId,
      ),
    );
    recipe.semanticLights.forEach((light, index) => {
      if (light?.emissiveSource !== null && !entityIds.has(light?.emissiveSource)) {
        errors.push(
          `semanticLights[${index}]: emissiveSource ${light?.emissiveSource} is not a scene entity`,
        );
      }
    });
  }

  return errors;
}
