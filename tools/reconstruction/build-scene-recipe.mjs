/**
 * Development-only Scene Recipe builder.
 *
 * Reads the measured Assembled Authored Scene inventory plus the reference
 * lighting evidence, and emits the single production-safe Scene Recipe.
 *
 * The Assembled Authored Scene is authoritative (ADR-0043): entities come from
 * what the reference actually assembles, one per authored placement, rather
 * than from an offline name-allowlist extractor. Only compact Semantic
 * Measurements cross the boundary — world placement, Target AABB Extent, typed
 * Scene Orientation, Material Family assignment, population regions, and
 * Semantic Lights. No source-node identifier, mesh, sample array, texture, or
 * elevation grid is retained.
 *
 *   node tools/reconstruction/build-scene-recipe.mjs
 *   node tools/reconstruction/build-scene-recipe.mjs --check
 */

import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { REFERENCE_LAYOUT } from "../../gt_designer/full-island-layout.generated.js";
import {
  SCENE_RECIPE_SCHEMA_VERSION,
  validateSceneRecipe,
} from "../../gt_designer/src/reconstruction/scene/scene-recipe-contract.js";
import { SCENE_SEED_VERSION } from "../../gt_designer/src/reconstruction/scene/scene-seed.js";
import { RNG_VERSION } from "../../gt_designer/src/reconstruction/core/rng.js";
import { SCENE_GENERATOR_VERSION } from "../../gt_designer/src/reconstruction/scene/scene-generator.js";
import {
  placementToken,
  readAuthoredPlacements,
  round,
} from "./scene-placements.mjs";
import { fitTerrainProgram } from "./fit-terrain-program.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const OUTPUT_PATH = path.join(
  PROJECT_ROOT,
  "gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js",
);
const INVENTORY_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence/scene-inventory-v1.json",
);
const ELEVATION_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence/terrain-elevation-v1.json",
);
const HORIZON_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence/horizon-reference-v1.json",
);
/**
 * Compact controls persisted by the Reference-guided Fitting Loop. They are
 * fitted against the reference and then live in the Scene Recipe, so a clean
 * production run reproduces them without the fitter.
 */
const FITTED_HORIZON_SPREAD_PATH = path.join(
  PROJECT_ROOT,
  "tools/reconstruction/fitted/horizon-spread-v1.json",
);

/** One stable root identity for the whole island. */
const SCENE_SEED = 20260729;

const MATERIAL_FAMILIES = [
  { id: "distant-rock", role: "horizon", albedo: [0.42, 0.46, 0.52], roughness: 0.96 },
  { id: "painted-timber", role: "architecture", albedo: [0.68, 0.36, 0.28], roughness: 0.72 },
  { id: "paving-stone", role: "ground", albedo: [0.66, 0.62, 0.55], roughness: 0.88 },
  { id: "shore-rock", role: "terrain-detail", albedo: [0.52, 0.5, 0.47], roughness: 0.93 },
  { id: "palm-foliage", role: "vegetation", albedo: [0.29, 0.47, 0.24], roughness: 0.78 },
  { id: "blossom-foliage", role: "vegetation", albedo: [0.85, 0.6, 0.7], roughness: 0.74 },
  { id: "bamboo-foliage", role: "vegetation", albedo: [0.44, 0.58, 0.29], roughness: 0.7 },
  { id: "terrain-ground", role: "terrain", albedo: [0.5, 0.55, 0.33], roughness: 0.95 },
  { id: "ocean-surface", role: "water", albedo: [0.31, 0.72, 0.72], roughness: 0.15 },
  { id: "creature-fur", role: "wildlife", albedo: [0.86, 0.85, 0.84], roughness: 0.85 },
];

function buildEntities(inventory, horizonEvidence, fittedSpread) {
  return readAuthoredPlacements(inventory, horizonEvidence).placements.map((placement) => ({
    semanticId: placement.semanticId,
    kind: placement.kind,
    group: placement.group,
    anchor: placement.anchor,
    extent: placement.extent,
    orientation: placement.orientation,
    materialFamily: placement.materialFamily,
    ...(placement.shape
      ? {
          shape: {
            ...placement.shape,
            ...(fittedSpread?.values?.[placement.semanticId] !== undefined
              ? { spreadScale: fittedSpread.values[placement.semanticId] }
              : {}),
          },
        }
      : {}),
  }));
}

/**
 * Semantic Lights come from the assembled scene, which is authoritative: the
 * reference drops zero-intensity sources, caps reach, and scales intensity
 * before instantiating, so measuring the result avoids re-deriving those rules
 * and then disagreeing with what is actually lit.
 */
const GLOBAL_LIGHT_TYPES = ["DirectionalLight", "HemisphereLight", "AmbientLight"];

function buildSemanticLights(inventory, entities) {
  return inventory.lights
    .filter((light) => !GLOBAL_LIGHT_TYPES.includes(light.type))
    .map((light, index) => {
      const nearest = entities.reduce((best, entity) => {
        const distance = Math.hypot(
          entity.anchor[0] - light.position[0],
          entity.anchor[1] - light.position[1],
          entity.anchor[2] - light.position[2],
        );
        return !best || distance < best.distance ? { entity, distance } : best;
      }, null);
      return {
        lightId: `lights/point-${placementToken(light.position[0])}-${placementToken(light.position[2])}-${index}`,
        position: light.position.map((value) => round(value)),
        color: [
          round(((light.color >> 16) & 0xff) / 255, 4),
          round(((light.color >> 8) & 0xff) / 255, 4),
          round((light.color & 0xff) / 255, 4),
        ],
        range: round(light.distance ?? 0),
        intensity: round(light.intensity, 3),
        decay: 2,
        castShadow: light.castShadow,
        // A light is associated with an emissive entity only when it actually
        // sits on one; an unattached light stays explicit rather than invented.
        emissiveSource: nearest && nearest.distance <= 25 ? nearest.entity.semanticId : null,
      };
    });
}

/**
 * Distributed Scene Cover populations, measured from the reference's own
 * instanced meshes and cloud sprites rather than declared by hand.
 */
function buildPopulations(inventory) {
  const { world } = REFERENCE_LAYOUT;
  const instanced = inventory.items
    .filter((item) => item.instanceCount > 1 && item.bounds)
    .sort((a, b) => b.instanceCount - a.instanceCount);
  const sprites = inventory.items.filter((item) => item.type === "Sprite" && item.bounds);

  const populations = instanced.map((item) => {
    const spanX = (item.bounds.max[0] - item.bounds.min[0]) / 2;
    const spanZ = (item.bounds.max[2] - item.bounds.min[2]) / 2;
    const height = item.bounds.max[1] - item.bounds.min[1];
    const kind = height <= 3 ? "grass-tuft" : "ground-rock";
    return {
      coverId: `cover/${kind}-${placementToken(spanX)}-${item.instanceCount}`,
      kind,
      count: item.instanceCount,
      region: {
        shape: "island-ellipse",
        center: [
          round((item.bounds.min[0] + item.bounds.max[0]) / 2),
          round((item.bounds.min[2] + item.bounds.max[2]) / 2),
        ],
        radii: [round(spanX), round(spanZ)],
        innerRadius: 0,
        outerRadius: 1,
      },
      heightRange: [round(item.bounds.min[1]), round(item.bounds.max[1])],
      scaleRange: [0.6, 1.6],
      orientation: "radial",
      materialFamily: kind === "grass-tuft" ? "terrain-ground" : "shore-rock",
    };
  });

  if (sprites.length > 0) {
    const min = [0, 1, 2].map((axis) =>
      Math.min(...sprites.map((sprite) => sprite.bounds.min[axis])),
    );
    const max = [0, 1, 2].map((axis) =>
      Math.max(...sprites.map((sprite) => sprite.bounds.max[axis])),
    );
    const width = sprites.map((sprite) => sprite.bounds.max[0] - sprite.bounds.min[0]);
    populations.push({
      coverId: "cover/sky-clouds",
      kind: "cloud",
      count: sprites.length,
      region: {
        shape: "sky-shell",
        center: [round((min[0] + max[0]) / 2), round((min[2] + max[2]) / 2)],
        radii: [round((max[0] - min[0]) / 2), round((max[2] - min[2]) / 2)],
        minHeight: round(min[1]),
        maxHeight: round(max[1]),
        innerRadius: 0.25,
        outerRadius: 1,
      },
      spanRange: [round(Math.min(...width)), round(Math.max(...width))],
      scaleRange: [0.6, 1.6],
      orientation: "radial",
      materialFamily: "ocean-surface",
      heightRange: [round(min[1]), round(max[1])],
    });
  }
  void world;
  return populations;
}

const ENVIRONMENT = {
  sun: {
    elevationDegrees: 23,
    azimuthDegrees: 60,
    color: 0xffce86,
    intensity: 2.7,
    castShadow: true,
    shadowMapSize: [4096, 4096],
    shadowBias: -0.0004,
  },
  hemisphere: { sky: 0xcfe2f0, ground: 0xc6b06a, intensity: 1.12 },
  ambient: { color: 0xfff0d6, intensity: 0.34 },
  fog: { kind: "linear", color: 0xe6dcc2, near: 650, far: 3500 },
  // The authored dome is five colours and a sun glow, not two colours. Recording
  // only zenith and horizon left the generator to invent the whole band between
  // them, which is measurable: with the two-colour gradient the sky read DeltaE
  // 3.39 on `oblique-north`, which sees mostly high sky, and 26.54 on the authored
  // overview, which looks out at the horizon and the sun where `mid`, `haze`, and
  // `glow` do the work. The stops and exponents are here for the same reason: a
  // gradient's shape is as much of its appearance as its endpoints.
  sky: {
    kind: "gradient",
    zenith: 0x3f7ec8,
    horizon: 0xaccfe6,
    mid: 0x73aadf,
    haze: 0xeedfba,
    glow: 0xffdf9c,
    radius: 9000,
    // Blue reaches low, so it dominates even horizon-heavy framings.
    midStop: [0, 0.18],
    zenithStop: [0.1, 0.62],
    // Warm haze confined to the lowest sliver of sky.
    hazeBand: { scale: 4.5, exponent: 2.6, mix: 0.3 },
    // Two terms: a wide golden wash and a tight disc, both gentle enough that
    // bloom does not blow them to white.
    sunGlow: { wideExponent: 9, wideWeight: 0.22, tightExponent: 150, tightWeight: 0.4 },
  },
  ocean: {
    color: 0x4fb7b8,
    sunColor: 0xfff0cf,
    distortion: 1.6,
    alpha: 0.92,
    // The Ocean Appearance Surface must fill the sea in every frozen camera, not
    // just the authored overview. Its half extent therefore clears the 30000
    // far plane measured from the outermost oblique camera at ~5100 units, not
    // from the world origin.
    extent: 74000,
  },
  renderer: {
    toneMapping: "ACESFilmicToneMapping",
    exposure: 1,
    outputColorSpace: "SRGBColorSpace",
    shadowType: "PCFSoftShadowMap",
  },
  // The authored chain is a bloom pass, then one grade-and-vignette shader, then
  // an output pass. `warmMix` and `gamma` alone do not describe the grade: the
  // shader mixes towards `colour * tint + lift`, and the vignette falls off as
  // `amount * dot(offset, offset) * falloff` from the frame centre. Those three
  // constants are recorded here so the Environment Recipe describes the grade
  // completely and the generator has nothing left to guess.
  postprocessing: {
    bloom: { strength: 0.26, radius: 0.7, threshold: 0.9 },
    grading: {
      warmMix: 0.6,
      gamma: 0.96,
      tint: [1.04, 1.015, 0.97],
      lift: [0.012, 0.008, 0],
    },
    vignette: { amount: 0.34, falloff: 2 },
    filmGrain: { amount: 0 },
  },
  camera: {
    position: [390, 190, 410],
    target: [80, 26, -20],
    verticalFovDegrees: 58,
    near: 0.5,
    far: 30000,
  },
};

/**
 * Terrain is the Bounded Semantic Terrain Program fitted from the complete
 * measured elevation evidence. The Scene Recipe keeps only the fitted controls,
 * never the grid they were fitted from.
 */
function buildTerrain(elevation, world) {
  return fitTerrainProgram(elevation, {
    center: world.center,
    groundY: world.groundY,
    oceanFloor: world.oceanFloor,
    sceneSeed: SCENE_SEED,
  });
}

function buildRecipe(inventory, elevation, horizonEvidence, fittedSpread) {
  const entities = buildEntities(inventory, horizonEvidence, fittedSpread);
  return {
    schemaVersion: SCENE_RECIPE_SCHEMA_VERSION,
    generatorVersion: SCENE_GENERATOR_VERSION,
    rngVersion: RNG_VERSION,
    seedVersion: SCENE_SEED_VERSION,
    sceneSeed: SCENE_SEED,
    sceneAnchor: [86, 26, -24],
    world: {
      semanticSeaLevel: 16,
      seaLevelNormal: [0, 1, 0],
      groundY: REFERENCE_LAYOUT.world.groundY,
      oceanFloor: REFERENCE_LAYOUT.world.oceanFloor,
      center: REFERENCE_LAYOUT.world.center,
      coastExtent: REFERENCE_LAYOUT.world.coast,
    },
    environment: ENVIRONMENT,
    terrain: buildTerrain(elevation, REFERENCE_LAYOUT.world),
    materialFamilies: MATERIAL_FAMILIES,
    entities,
    populations: buildPopulations(inventory),
    semanticLights: buildSemanticLights(inventory, entities),
  };
}

function serialize(recipe) {
  return `// Generated by tools/reconstruction/build-scene-recipe.mjs — do not edit by hand.
// The sole production-safe scene-specific artifact: compact Semantic
// Measurements, deterministic seed state, and Material Family references.

export const ISLAND_SCENE_RECIPE = Object.freeze(${JSON.stringify(recipe, null, 2)});
`;
}

async function main() {
  const [inventory, elevation, horizonEvidence] = await Promise.all([
    readFile(INVENTORY_PATH, "utf8").then(JSON.parse),
    readFile(ELEVATION_PATH, "utf8").then(JSON.parse),
    readFile(HORIZON_PATH, "utf8").then(JSON.parse),
  ]);
  assert.equal(inventory.schemaVersion, "scene-inventory-v1");
  assert.equal(elevation.schemaVersion, "terrain-elevation-v1");
  assert.equal(horizonEvidence.schemaVersion, "horizon-evidence-v1");

  let fittedSpread = null;
  try {
    fittedSpread = JSON.parse(await readFile(FITTED_HORIZON_SPREAD_PATH, "utf8"));
    assert.equal(fittedSpread.schemaVersion, "horizon-spread-fit-v1");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const recipe = buildRecipe(inventory, elevation, horizonEvidence, fittedSpread);
  assert.deepEqual(
    validateSceneRecipe(recipe),
    [],
    "generated Scene Recipe failed its own contract",
  );

  const serialized = serialize(recipe);
  if (process.argv.includes("--check")) {
    const existing = await readFile(OUTPUT_PATH, "utf8");
    assert.equal(
      existing,
      serialized,
      "island-scene-recipe.generated.js drifted; run node tools/reconstruction/build-scene-recipe.mjs",
    );
    process.stdout.write(
      `Scene Recipe: OK (${recipe.entities.length} entities, ${recipe.populations.length} populations, ${recipe.semanticLights.length} semantic lights, frozen)\n`,
    );
    return;
  }
  await writeFile(OUTPUT_PATH, serialized);
  process.stdout.write(
    `Scene Recipe: wrote ${recipe.entities.length} entities, ${recipe.populations.length} populations, ${recipe.semanticLights.length} semantic lights\n`,
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
