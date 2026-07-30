/**
 * Development-only Scene Recipe builder.
 *
 * Reads the measured full-island layout plus the reference lighting and
 * wildlife evidence, and emits the single production-safe Scene Recipe. Only
 * compact Semantic Measurements cross the boundary: world placement, Target AABB
 * Extent, typed Scene Orientation, Material Family assignment, population
 * regions, and Semantic Lights. No source-node identifier, mesh, sample array,
 * texture, or heightfield is retained.
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

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const OUTPUT_PATH = path.join(
  PROJECT_ROOT,
  "gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js",
);
const LIGHTING_PATH = path.join(PROJECT_ROOT, "gt_designer/data/lighting.json");
const WILDLIFE_PATH = path.join(PROJECT_ROOT, "gt_designer/data/wildlife.json");

/** One stable root identity for the whole island. */
const SCENE_SEED = 20260729;

/**
 * Scene Semantic IDs are derived from world placement so inserting, deleting, or
 * reordering an entity cannot renumber any other entity.
 */
function placementToken(value) {
  // Decimetres: fine enough that two distinct authored entities never share a
  // token, coarse enough to stay readable and stable under re-measurement.
  const rounded = Math.round(value * 10);
  return `${rounded < 0 ? "n" : "p"}${String(Math.abs(rounded)).padStart(4, "0")}`;
}

function semanticId(group, kind, anchor) {
  return `${group}/${kind}-${placementToken(anchor[0])}-${placementToken(anchor[1])}-${placementToken(anchor[2])}`;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Number(Math.round(value * factor) / factor);
}

function vector(values, digits = 2) {
  return values.map((value) => round(value, digits));
}

/**
 * Semantic group definitions. `orientation` records what the authored evidence
 * actually determines rather than presenting a PCA principal axis as a facing
 * direction: a pavilion has a front, a rock does not, and a palm has no
 * meaningful yaw at all.
 */
const GROUPS = [
  { source: "mountains", group: "horizon", orientation: "axis", materialFamily: "distant-rock" },
  { source: "structures", group: "structures", orientation: "heading", materialFamily: "painted-timber" },
  { source: "bridges", group: "bridges", orientation: "heading", materialFamily: "painted-timber" },
  { source: "plazas", group: "plazas", orientation: "axis", materialFamily: "paving-stone" },
  { source: "pathStones", group: "paths", orientation: "surface-aligned", materialFamily: "paving-stone" },
  { source: "rocks", group: "rocks", orientation: "axis", materialFamily: "shore-rock" },
  { source: "decorations", group: "decorations", orientation: "heading", materialFamily: "painted-timber" },
  { source: "palms", group: "vegetation", orientation: "radial", materialFamily: "palm-foliage" },
  { source: "blossoms", group: "vegetation", orientation: "radial", materialFamily: "blossom-foliage" },
  { source: "bamboo", group: "vegetation", orientation: "radial", materialFamily: "bamboo-foliage" },
];

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

function orientationFor(type, yaw) {
  if (type === "radial") return { type };
  if (type === "surface-aligned") {
    return { type, radians: round(yaw, 3), supportNormal: [0, 1, 0] };
  }
  return { type, radians: round(yaw, 3) };
}

function buildEntities() {
  const entities = [];
  for (const { source, group, orientation, materialFamily } of GROUPS) {
    for (const item of REFERENCE_LAYOUT[source]) {
      const anchor = vector(item.position);
      entities.push({
        semanticId: semanticId(group, item.kind, anchor),
        kind: item.kind,
        group,
        anchor,
        extent: vector(item.size),
        orientation: orientationFor(orientation, item.yaw),
        materialFamily,
      });
    }
  }
  return entities;
}

/**
 * Wildlife placement in the layout is a rig-root translation rather than a
 * complete-AABB bottom-center, so the anchor and Target AABB Extent are measured
 * here from the reference's own mesh boxes.
 */
function wildlifeBounds(model) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const visit = (node) => {
    const matrix = node?.properties?.matrix;
    const size = node?.properties?.size;
    if (node?.type === "Mesh" && matrix && size) {
      const center = [matrix[3], matrix[7], matrix[11]];
      for (let axis = 0; axis < 3; axis += 1) {
        const row = axis * 4;
        const half =
          0.5 *
          (Math.abs(matrix[row]) * size[0] +
            Math.abs(matrix[row + 1]) * size[1] +
            Math.abs(matrix[row + 2]) * size[2]);
        min[axis] = Math.min(min[axis], center[axis] - half);
        max[axis] = Math.max(max[axis], center[axis] + half);
      }
    }
    for (const child of node?.children ?? []) visit(child);
  };
  visit(model);
  return min.every(Number.isFinite) ? { min, max } : null;
}

function buildWildlifeEntities(wildlife, layoutWildlife) {
  const measured = (wildlife.children ?? [])
    .map((model) => {
      const bounds = wildlifeBounds(model);
      if (!bounds) return null;
      const { min, max } = bounds;
      return {
        anchor: [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2],
        extent: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
      };
    })
    .filter(Boolean);

  // Pair each layout anchor with its nearest measured box so deletions and
  // position overrides in the layout stay authoritative for which pandas exist.
  return layoutWildlife.map((item) => {
    const nearest = measured.reduce((best, candidate) => {
      const distance = Math.hypot(
        candidate.anchor[0] - item.position[0],
        candidate.anchor[2] - item.position[2],
      );
      return !best || distance < best.distance ? { ...candidate, distance } : best;
    }, null);
    assert.ok(nearest, "wildlife evidence is missing measured geometry");
    const anchor = vector([
      item.position[0],
      nearest.anchor[1] + (item.position[1] - nearest.anchor[1]) * 0,
      item.position[2],
    ]);
    return {
      semanticId: semanticId("wildlife", item.kind, anchor),
      kind: item.kind,
      group: "wildlife",
      anchor: [anchor[0], round(nearest.anchor[1]), anchor[2]],
      extent: vector(nearest.extent),
      orientation: orientationFor("heading", item.yaw),
      materialFamily: "creature-fur",
    };
  });
}

function buildSemanticLights(lighting, entities) {
  const anchors = entities.map((entity) => entity);
  return lighting.lights.map((light, index) => {
    const nearest = anchors.reduce((best, entity) => {
      const distance = Math.hypot(
        entity.anchor[0] - light.position[0],
        entity.anchor[1] - light.position[1],
        entity.anchor[2] - light.position[2],
      );
      return !best || distance < best.distance ? { entity, distance } : best;
    }, null);
    return {
      lightId: `lights/point-${placementToken(light.position[0])}-${placementToken(light.position[2])}-${index}`,
      position: vector(light.position),
      color: vector(light.color, 4),
      range: round(light.range, 2),
      intensity: round(light.intensity, 3),
      castShadow: false,
      // A light is associated with an emissive entity only when it actually sits
      // on one; an unattached light stays explicit rather than being invented.
      emissiveSource: nearest && nearest.distance <= 40 ? nearest.entity.semanticId : null,
    };
  });
}

function buildPopulations() {
  const { world } = REFERENCE_LAYOUT;
  return [
    {
      coverId: "cover/shore-pebbles",
      kind: "pebble",
      count: 4200,
      region: { shape: "coast-band", innerRadius: 0.86, outerRadius: 1.0 },
      scaleRange: [0.4, 1.6],
      orientation: "radial",
      materialFamily: "shore-rock",
    },
    {
      coverId: "cover/inland-rocks",
      kind: "ground-rock",
      count: 900,
      region: { shape: "inland-disc", innerRadius: 0, outerRadius: 0.88 },
      scaleRange: [0.6, 2.4],
      orientation: "radial",
      materialFamily: "shore-rock",
    },
    {
      coverId: "cover/meadow-grass",
      kind: "grass-tuft",
      count: 5200,
      region: { shape: "inland-disc", innerRadius: 0, outerRadius: 0.8 },
      scaleRange: [0.5, 1.4],
      orientation: "radial",
      materialFamily: "terrain-ground",
    },
    {
      coverId: "cover/sky-clouds",
      kind: "cloud",
      count: 34,
      region: {
        shape: "sky-shell",
        minHeight: world.groundY + 240,
        maxHeight: world.groundY + 520,
        radius: 2600,
      },
      scaleRange: [0.7, 1.8],
      orientation: "radial",
      materialFamily: "ocean-surface",
    },
  ];
}

/**
 * Environment Recipe values are semantic parameters the replacement reproduces
 * independently; they are not read from the reference at runtime.
 */
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
  sky: { kind: "gradient", zenith: 0x3f7ec8, horizon: 0xaccfe6 },
  ocean: { color: 0x4fb7b8, sunColor: 0xfff0cf, distortion: 1.6, alpha: 0.92 },
  renderer: {
    toneMapping: "ACESFilmicToneMapping",
    exposure: 1,
    outputColorSpace: "SRGBColorSpace",
    shadowType: "PCFSoftShadowMap",
  },
  postprocessing: {
    bloom: { strength: 0.26, radius: 0.7, threshold: 0.9 },
    grading: { warmMix: 0.6, gamma: 0.96 },
    vignette: { amount: 0.34 },
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
 * Terrain stays a passthrough of the measured radial evidence at this stage.
 * Foundation ticket 06 replaces it with the Bounded Semantic Terrain Program;
 * the field is versioned so that swap is explicit rather than silent.
 */
function buildTerrain() {
  const { terrain, world } = REFERENCE_LAYOUT;
  return {
    program: "measured-radial-coast-v1",
    supersededBy: "bounded-semantic-terrain-program",
    center: [world.center[0], world.center[1]],
    groundY: world.groundY,
    oceanFloor: world.oceanFloor,
    coastExtent: world.coast,
    flatExtent: world.flat,
    coastlineRadii: terrain.coastlineRadii,
    relief: terrain.relief,
  };
}

function buildRecipe(lighting, wildlife) {
  const entities = [
    ...buildEntities(),
    ...buildWildlifeEntities(wildlife, REFERENCE_LAYOUT.wildlife),
  ];
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
    terrain: buildTerrain(),
    materialFamilies: MATERIAL_FAMILIES,
    entities,
    populations: buildPopulations(),
    semanticLights: buildSemanticLights(lighting, entities),
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
  const [lighting, wildlife] = await Promise.all([
    readFile(LIGHTING_PATH, "utf8").then(JSON.parse),
    readFile(WILDLIFE_PATH, "utf8").then(JSON.parse),
  ]);
  const recipe = buildRecipe(lighting, wildlife);
  const errors = validateSceneRecipe(recipe);
  assert.deepEqual(errors, [], "generated Scene Recipe failed its own contract");

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
