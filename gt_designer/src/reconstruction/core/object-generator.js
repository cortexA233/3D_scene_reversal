import { createSeededRng } from "./rng.js";

/**
 * @template {Record<string, unknown>} Shape
 * @template {Record<string, unknown>} Appearance
 * @typedef {object} ObjectRecipe
 * @property {string} id stable semantic ID
 * @property {string} kind stable generator kind
 * @property {number} seed unsigned 32-bit integer
 * @property {Shape} shape compact semantic shape parameters
 * @property {Appearance} appearance compact semantic appearance parameters
 */

/**
 * @typedef {ReturnType<typeof createSeededRng>} SeededRng
 */

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value */
export function assertObjectRecipe(value) {
  if (!isRecord(value)) throw new TypeError("recipe must be an object");
  if (typeof value.id !== "string" || value.id.trim() === "") {
    throw new TypeError("recipe.id must be a non-empty string");
  }
  if (typeof value.kind !== "string" || value.kind.trim() === "") {
    throw new TypeError("recipe.kind must be a non-empty string");
  }
  if (
    !Number.isInteger(value.seed) ||
    value.seed < 0 ||
    value.seed >= 0x1_0000_0000
  ) {
    throw new RangeError("recipe.seed must be an unsigned 32-bit integer");
  }
  if (!isRecord(value.shape)) {
    throw new TypeError("recipe.shape must be an object");
  }
  if (!isRecord(value.appearance)) {
    throw new TypeError("recipe.appearance must be an object");
  }
  return value;
}

/**
 * Generate one semantic root from a recipe.
 *
 * @template {ObjectRecipe<Record<string, unknown>, Record<string, unknown>>} Recipe
 * @param {Recipe} recipe
 * @param {(recipe: Recipe, rng: SeededRng) => import("three").Object3D} generator
 */
export function generateObject(recipe, generator) {
  assertObjectRecipe(recipe);
  if (typeof generator !== "function") {
    throw new TypeError("generator must be a function");
  }

  const root = generator(recipe, createSeededRng(recipe.seed));
  if (!root?.isObject3D) {
    throw new TypeError("generator must return one THREE.Object3D root");
  }
  if (root.userData.semanticId !== recipe.id) {
    throw new Error("generated root semantic ID must equal recipe.id");
  }

  const seen = new Set();
  root.traverse((part) => {
    const id = part.userData.semanticId;
    if (id === undefined) return;
    if (typeof id !== "string" || id.trim() === "") {
      throw new TypeError("semantic IDs must be non-empty strings");
    }
    if (seen.has(id)) throw new Error(`duplicate semantic ID: ${id}`);
    seen.add(id);
  });

  return root;
}

export function semanticPartId(rootId, part) {
  if (typeof rootId !== "string" || rootId.trim() === "") {
    throw new TypeError("rootId must be a non-empty string");
  }
  if (typeof part !== "string" || !/^[a-z][a-z0-9-]*$/.test(part)) {
    throw new TypeError("part must be a lowercase semantic segment");
  }
  return `${rootId}/${part}`;
}
