/**
 * Scene Seed Derivation.
 *
 * One root `sceneSeed` plus a stable Scene Semantic ID and a purpose label
 * produce an isolated unsigned 32-bit stream seed. The derivation is stateless,
 * so inserting an entity, reordering the recipe, generating a subset, or adding
 * one random draw inside a generator cannot perturb any other entity.
 *
 * Encoding is UTF-8 and every intermediate is forced through `>>> 0`, which
 * keeps the result identical on any JavaScript engine.
 */

export const SCENE_SEED_VERSION = "scene-seed-fnv1a-mulberry32-v1";

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const UINT32_RANGE = 0x1_0000_0000;
const TEXT_ENCODER = new TextEncoder();

function fnv1a(bytes, basis) {
  let hash = basis >>> 0;
  for (let index = 0; index < bytes.length; index += 1) {
    hash = (hash ^ bytes[index]) >>> 0;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

function mixUint32(hash, value) {
  let mixed = hash >>> 0;
  for (let shift = 0; shift < 32; shift += 8) {
    mixed = (mixed ^ ((value >>> shift) & 0xff)) >>> 0;
    mixed = Math.imul(mixed, FNV_PRIME) >>> 0;
  }
  return mixed >>> 0;
}

/**
 * Final avalanche so neighbouring semantic IDs, which share long prefixes, do
 * not produce neighbouring seeds.
 */
function avalanche(value) {
  let state = value >>> 0;
  state = Math.imul(state ^ (state >>> 16), 0x7feb352d) >>> 0;
  state = Math.imul(state ^ (state >>> 15), 0x846ca68b) >>> 0;
  return (state ^ (state >>> 16)) >>> 0;
}

/**
 * @param {number} sceneSeed unsigned 32-bit root seed
 * @param {string} semanticId stable Scene Semantic ID
 * @param {string} purpose isolated stream label
 * @returns {number} unsigned 32-bit derived seed
 */
export function deriveSceneSeed(sceneSeed, semanticId, purpose) {
  if (
    !Number.isInteger(sceneSeed) ||
    sceneSeed < 0 ||
    sceneSeed >= UINT32_RANGE
  ) {
    throw new RangeError("sceneSeed must be an unsigned 32-bit integer");
  }
  if (typeof semanticId !== "string" || semanticId.trim() === "") {
    throw new TypeError("semanticId must be a non-empty string");
  }
  if (typeof purpose !== "string" || !/^[a-z][a-z0-9-]*$/.test(purpose)) {
    throw new TypeError("purpose must be a lowercase semantic label");
  }

  let hash = mixUint32(FNV_OFFSET_BASIS, sceneSeed);
  hash = fnv1a(TEXT_ENCODER.encode(semanticId), hash);
  // A separator byte no semantic segment can contain keeps `a/b` + `c` from
  // colliding with `a/bc` + the empty purpose.
  hash = fnv1a(Uint8Array.of(0x1f), hash);
  hash = fnv1a(TEXT_ENCODER.encode(purpose), hash);
  return avalanche(hash);
}

/**
 * Frozen cross-engine vectors. A change here is a versioned migration, not a
 * bug fix.
 */
const GOLDEN_VECTORS = Object.freeze(
  [
    { sceneSeed: 0, semanticId: "a", purpose: "geometry", derived: 4230450613 },
    { sceneSeed: 1, semanticId: "a", purpose: "geometry", derived: 3615075428 },
    { sceneSeed: 20260729, semanticId: "a/b", purpose: "geometry", derived: 967083809 },
    { sceneSeed: 20260729, semanticId: "a/b", purpose: "material", derived: 686543622 },
    { sceneSeed: 20260729, semanticId: "a/b", purpose: "distribution", derived: 4157191342 },
    { sceneSeed: 20260729, semanticId: "a/b", purpose: "environment", derived: 1417896550 },
    { sceneSeed: 20260729, semanticId: "a/c", purpose: "geometry", derived: 2406399607 },
    { sceneSeed: 20260729, semanticId: "café", purpose: "geometry", derived: 2875687887 },
    {
      sceneSeed: 4294967295,
      semanticId: "structures/pavilion-p031-n155",
      purpose: "geometry",
      derived: 836546311,
    },
  ].map((vector) => Object.freeze(vector)),
);

export function sceneSeedGoldenVectors() {
  return GOLDEN_VECTORS;
}
