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
 * Per-instance Distributed Scene Cover evidence, measured by
 * `tools/development/measure-cover-instances.mjs`. Separate from the inventory
 * because it is a distribution rather than a summary, and the inventory's
 * per-population totals cannot carry one.
 */
const COVER_INSTANCES_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/full-island-reconstruction/evidence/cover-instances-v1.json",
);
/**
 * Authored ground-plate footprint coverage, measured by
 * `tools/development/measure-plate-footprint.mjs`. Absent on a clean checkout, in
 * which case the plate kinds fall back to a filled plate.
 */
const PLATE_FOOTPRINT_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/full-island-reconstruction/evidence/plate-footprint-v1.json",
);
const SURFACE_SAMPLES_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence/scene-surface-samples-v1.json",
);
/**
 * The kinds whose generator reads plate controls. `bridge` is measured too but
 * its two placements have opposite vertical massing, which a footprint control
 * cannot carry, so it keeps its own form until that is measured.
 */
// `paving-slab` joins them on the ADR-0067 decision. It had no footprint controls at all
// while the plaza and the deck each had theirs, and measured it is not a slab: its
// footprint is a scatter of small stones at a median coverage of 0.1862, against a
// candidate hexagon covering about 0.75. Per entity rather than per family because the
// 42 assets range from 0.115 to 0.803 and one of them really is a solid slab.
const PLATE_CONTROL_KINDS = ["plaza", "deck", "paving-slab"];
/**
 * `bridge` carries its own triple instead. A footprint coverage plus a perimeter share
 * cannot describe it — the two placements run along opposite diagonals of their own boxes
 * and have opposite vertical massing — so it takes the coverage plus the axis and the deck
 * height, all three from the same scan-converted measurement.
 */
const BRIDGE_CONTROL_KINDS = ["bridge"];
/**
 * Compact controls persisted by the Reference-guided Fitting Loop. They are
 * fitted against the reference and then live in the Scene Recipe, so a clean
 * production run reproduces them without the fitter.
 */
const FITTED_HORIZON_RIDGE_PATH = path.join(
  PROJECT_ROOT,
  "tools/reconstruction/fitted/horizon-ridge-v1.json",
);
/**
 * Per-family albedo measured from the authored base colour maps and base colours by
 * `tools/development/measure-material-albedo.mjs`. Absent on a clean checkout, in
 * which case the declared albedos below stand as they are.
 */
const MATERIAL_ALBEDO_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/full-island-reconstruction/evidence/material-albedo-v1.json",
);

/** One stable root identity for the whole island. */
const SCENE_SEED = 20260729;

/**
 * The declared Material Families, and where their numbers come from.
 *
 * The albedos written here are a fallback, not the answer. An authored material's base
 * colour cannot supply them on its own: measured from the assembled scene, the authored
 * surfaces are overwhelmingly textured with white base colours, which is why ADR-0051's
 * `desaturate-albedo` control registered a DeltaE of 0.057 — less than a one per cent
 * mild control — and had to be replaced. The colour lives in maps the Production Runtime
 * may not load, so carrying each family's mean is a Material Family's whole job.
 *
 * `measure-material-albedo.mjs` measures it: the area-weighted mean linear reflectance
 * of every surface that resolves to the family, from its map where it has one and from
 * its base colour where it does not, alpha-weighted so a leaf card's transparent field
 * does not dilute the leaf. Three numbers per family, merged below, so a clean
 * generation reproduces them without the tool.
 *
 * It is measured rather than fitted through a render on purpose. The authored canopy
 * renders dark partly because it is dense and self-shadowing, and a sparser candidate
 * that matched the rendered mean by lowering its albedo would be standing material in
 * for missing geometry — which is what ADR-0040's ordering rule exists to prevent.
 * Measuring separates them: the albedo is the authored material's own reflectance, and
 * whatever rendered difference remains is honestly geometry's.
 */
const DECLARED_MATERIAL_FAMILIES = [
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

function materialFamilies(measuredAlbedo) {
  const measured = new Map(
    (measuredAlbedo?.families ?? []).map((family) => [family.id, family]),
  );
  return DECLARED_MATERIAL_FAMILIES.map((family) => {
    const row = measured.get(family.id);
    // `usable` is the tool's own statement that it reached enough of the family for
    // the number to mean anything. A family it did not reach keeps the declared
    // albedo, and the tool's evidence file records which and why.
    if (!row?.usable) return family;
    const merged = { ...family };
    if (row.albedo) merged.albedo = row.albedo;
    /**
     * Roughness and metalness, measured rather than declared.
     *
     * The albedo at least had an excuse for being hand-written — it lives in maps the
     * Production Runtime may not load. Roughness never did: the authored materials record
     * it as a plain scalar, 957 of 993 of them, and every family declares one over 100
     * per cent of its own surface. The hand-written values were wrong by up to 0.17,
     * with `terrain-ground` at 0.95 against a measured 0.80 and `distant-rock` 0.96
     * against 0.80 — both far rougher than the authored surface, which is why the
     * candidate's ground and distant ridges read flat.
     *
     * `roughnessFraction` is the share of the family's surface that declared one at all,
     * and it has to be essentially all of it: a family measured from a sliver is the
     * `shore-rock` albedo mistake, where 2.2 per cent of the surface carried a map and
     * averaging only that gave the whole family one small prop's colour.
     */
    if (Number.isFinite(row.roughness) && row.roughnessFraction >= 0.9) {
      merged.roughness = row.roughness;
    }
    if (Number.isFinite(row.metalness) && row.metalness > 0) {
      merged.metalness = row.metalness;
    }
    return merged;
  });
}

/**
 * How large a population's instances actually are, and how they sit in the
 * ground, from the reference's own per-instance matrices.
 *
 * This has now been wrong twice in the same place, in opposite directions, and
 * both times because the input was a summary rather than a distribution.
 *
 * First `scaleRange` was a hardcoded `[0.6, 1.6]` for every population. Then it
 * became the range whose root-mean-square reproduces the population's measured
 * total world surface area, which is the right magnitude for the wrong quantity:
 * rasterisation is not linear in size, so a distribution whose instances
 * straddle one pixel does not render like a uniform distribution with the same
 * sum of squares, and the spread stayed an invented shape rule either way.
 *
 * What the reference actually has, measured instance by instance, is a power-law
 * ladder — `min + pow(uniform, exponent) * (max - min)` — a mean per-axis
 * proportion, and a sink expressed as a fraction of each instance's own scale.
 * Those are read from `cover-instances-v1.json` and carried as measured numbers:
 * three for the ladder, one for the sink, and the authored form's own extent and
 * origin height so a scale means the same world size it means in the reference.
 * Ten numbers per population, none of them chosen.
 *
 * The mean per-axis proportion is folded into the form extent rather than
 * carried separately, because the two only ever appear multiplied together: the
 * authored world extent of an instance is its form's extent times its scale
 * times that proportion.
 */
function measuredInstanceForm(measured) {
  const { localBounds } = measured.form;
  const lateral = measured.scale.axisJitter.lateralMean;
  const vertical = measured.scale.axisJitter.verticalMean;
  return {
    extent: [
      round((localBounds.max[0] - localBounds.min[0]) * lateral, 4),
      round((localBounds.max[1] - localBounds.min[1]) * vertical, 4),
      round((localBounds.max[2] - localBounds.min[2]) * lateral, 4),
    ],
    // Where the authored form's own origin sits above its base, which is what a
    // sink is measured against. The ground rocks are centred lumps and the grass
    // is a blade rooted at its base, so a single convention would misplace one of
    // them by half its height.
    originHeight: round(-localBounds.min[1] * vertical, 4),
  };
}

/**
 * Merges a group's fitted ridge controls onto its measured summits. Where a
 * summit sits stays measured; the loop only supplies how tall and how broad it
 * is and how the ridge through it behaves.
 */
function fittedShape(shape, fit) {
  if (!fit) return shape;
  const merge = (family) =>
    shape[family].map((form, index) => ({
      ...form,
      ...(fit.summits?.[family]?.[index] ?? {}),
    }));
  return {
    ...shape,
    peaks: merge("peaks"),
    foothills: merge("foothills"),
    ...fit.controls,
  };
}

/**
 * The two compact plate controls, per entity.
 *
 * `footprintCoverage` is measured, and coverage alone cannot say what shape has
 * it: a perimeter walk and crossing paths of equal area have footprint reach 0.71
 * and 0.28 on the unit square. So the authored reach — the mean distance of the
 * plate's own surface samples from its centre, doubled and expressed as a
 * fraction of extent — is inverted against those two closed forms to give
 * `perimeterShare`, the fraction of the covered area that is the walk. Both are
 * scalars; nothing per-entity is carried but two numbers.
 *
 * Reach is read from the same frozen samples the surface gate uses, so the
 * candidate and the reference are described by the same measurement.
 */
function plateControls(placement, plateCoverage, samples, members) {
  const coverage = plateCoverage.get(placement.semanticId);
  if (coverage === undefined) return null;
  const paths = [...members.entries()]
    .filter(([, key]) => key === placement.key)
    .map(([itemPath]) => itemPath);
  let lateral = 0;
  let count = 0;
  for (const itemPath of paths) {
    const flat = samples.samples[itemPath] ?? [];
    for (let slot = 0; slot + 2 < flat.length; slot += 3) {
      lateral +=
        Math.abs((flat[slot] - placement.anchor[0]) / placement.extent[0]) +
        Math.abs((flat[slot + 2] - placement.anchor[2]) / placement.extent[2]);
      count += 1;
    }
  }
  if (count === 0) return { footprintCoverage: round(coverage, 4), perimeterShare: 0 };
  const reach = lateral / count;
  // Crossing paths cover 4w - 4w^2; a perimeter walk covers 1 - (1 - 2w)^2.
  const pathHalf = (1 - Math.sqrt(Math.max(0, 1 - coverage))) / 2;
  const pathReach =
    (2 * (pathHalf ** 2 + 0.5 * pathHalf - 2 * pathHalf ** 3)) / (4 * pathHalf - 4 * pathHalf ** 2);
  const inner = Math.sqrt(Math.max(0, (1 - coverage) / 4));
  const walkReach = (2 * (0.25 - 2 * inner ** 3)) / Math.max(1e-6, 1 - 4 * inner ** 2);
  const span = walkReach - pathReach;
  const share = Math.abs(span) < 1e-6 ? 0 : (reach - pathReach) / span;
  return {
    footprintCoverage: round(coverage, 4),
    perimeterShare: round(Math.min(1, Math.max(0, share)), 4),
  };
}

/**
 * The bridge's three controls, from the plate measurement's own decomposition.
 *
 * `deckAxis` is the bearing between the two largest rectangles of the authored footprint,
 * which is where the plate attempt went wrong: it matched the coverage and the deck height
 * and put them on a centred cross, while the decomposition had already recorded that the
 * two bridges run along opposite diagonals at -119.2 and +136.1 degrees. `deckHeight` is
 * the centroid of the vertical area profile and `footprintCoverage` the scan-converted
 * coverage. The profile's *spread* is a family constant in the generator rather than a
 * control, because the two bridges agree on it to 1.5 per cent — 0.1842 against 0.1871 —
 * while `deckHeight` differs two-fold. That division was measured, not chosen.
 */
function bridgeControls(placement, bridgeAssets) {
  const asset = bridgeAssets?.get(placement.semanticId);
  if (!asset) return null;
  const profile = asset.verticalAreaProfile ?? [];
  const total = profile.reduce((sum, value) => sum + value, 0);
  if (!(total > 0) || (asset.rectangles?.length ?? 0) < 2) return null;
  const deckHeight =
    profile.reduce((sum, value, decile) => sum + value * ((decile + 0.5) / profile.length), 0) /
    total;
  const [first, second] = asset.rectangles;
  const axis = Math.atan2(second.centre[1] - first.centre[1], second.centre[0] - first.centre[0]);
  // How much of the area sits below mid-height: 9.8 per cent for the flat span and 62.7
  // for the arched one. Treating the two alike left the arched bridge hollow where the
  // reference is solid, which the depth pass reads directly.
  const half = Math.floor(profile.length / 2);
  const subDeck = profile.slice(0, half).reduce((sum, value) => sum + value, 0) / total;
  return {
    footprintCoverage: round(asset.coverage, 4),
    deckAxis: round(axis, 4),
    deckHeight: round(deckHeight, 4),
    subDeckShare: round(subDeck, 4),
  };
}

function buildEntities(
  inventory,
  horizonEvidence,
  fittedRidges,
  plateCoverage,
  samples,
  bridgeAssets,
) {
  const { placements, members } = readAuthoredPlacements(inventory, horizonEvidence);
  return placements.map((placement) => ({
    semanticId: placement.semanticId,
    kind: placement.kind,
    group: placement.group,
    anchor: placement.anchor,
    extent: placement.extent,
    orientation: placement.orientation,
    materialFamily: placement.materialFamily,
    ...(placement.shape
      ? { shape: fittedShape(placement.shape, fittedRidges?.values?.[placement.semanticId]) }
      : {}),
    ...(() => {
      if (placement.shape) return {};
      const controls =
        plateControls(placement, plateCoverage, samples, members) ??
        bridgeControls(placement, bridgeAssets);
      return controls ? { shape: controls } : {};
    })(),
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
      /**
       * The entity a light sits on, by distance to its **box** rather than to its anchor.
       *
       * An anchor is an entity's bottom-centre, and a lantern's light sits at the top of
       * the lantern, so an anchor distance is roughly the fixture's own height and the
       * nearest anchor is usually something else entirely. Measured, the anchor rule
       * attributed lights to a `panda`, a `bamboo-pile` and a `paving-slab`; the box rule
       * puts the same lights on the `wish-tree`, `dessert-shop` and `plaza` that actually
       * carry them. A wrong relationship in a frozen artefact is worse than none.
       *
       * Distance to an axis-aligned box is zero inside it, so "inside" and "just outside"
       * are one continuous test rather than two rules.
       */
      const nearest = entities.reduce((best, entity) => {
        let squared = 0;
        for (let axis = 0; axis < 3; axis += 1) {
          const half = axis === 1 ? 0 : entity.extent[axis] / 2;
          const low = axis === 1 ? entity.anchor[1] : entity.anchor[axis] - half;
          const high = axis === 1 ? entity.anchor[1] + entity.extent[1] : entity.anchor[axis] + half;
          const outside = Math.max(low - light.position[axis], 0, light.position[axis] - high);
          squared += outside * outside;
        }
        const distance = Math.sqrt(squared);
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
        // sits on one; an unattached light stays explicit rather than invented. Five
        // units is a light fixture's own scale on this island, against the 25 the anchor
        // rule needed to reach past an entity's own height.
        emissiveSource: nearest && nearest.distance <= 5 ? nearest.entity.semanticId : null,
      };
    });
}

/**
 * Distributed Scene Cover populations, measured from the reference's own
 * instanced meshes and cloud sprites rather than declared by hand.
 */
function buildPopulations(inventory, coverInstances) {
  const { world } = REFERENCE_LAYOUT;
  const instanced = inventory.items
    .filter((item) => item.instanceCount > 1 && item.bounds)
    .sort((a, b) => b.instanceCount - a.instanceCount);
  const sprites = inventory.items.filter((item) => item.type === "Sprite" && item.bounds);
  const measuredByPath = new Map(
    coverInstances.populations.map((population) => [population.path, population]),
  );

  const populations = instanced.map((item) => {
    const spanX = (item.bounds.max[0] - item.bounds.min[0]) / 2;
    const spanZ = (item.bounds.max[2] - item.bounds.min[2]) / 2;
    // Joined by the same development-only path key both measurements walk, so a
    // population cannot be silently matched to the wrong row by array order. A
    // missing row is a blocking failure rather than a fallback, because the
    // fallback is exactly the invented spread this replaces.
    const measured = measuredByPath.get(item.path);
    assert.ok(
      measured,
      `no per-instance measurement for the ${item.instanceCount}-instance population at ${item.path}; re-run tools/development/measure-cover-instances.mjs`,
    );
    assert.equal(measured.count, item.instanceCount);
    // What the population is made of, from the authored form rather than from the
    // spread of the whole population. The previous rule called anything whose
    // *population bounds* stood taller than three units a rock, and the grass
    // ellipses span seven units of terrain, so all five populations were labelled
    // ground rocks and the three blade populations were given rock albedo. The
    // authored form says it plainly: a blade is two triangles with no thickness,
    // and a rock is a closed lump.
    const form = measuredInstanceForm(measured);
    const flat = form.extent.some((value) => value === 0);
    const kind = flat && measured.form.triangles <= 2 ? "grass-blade" : "ground-rock";
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
      scaleRange: [round(measured.scale.min, 4), round(measured.scale.max, 4)],
      scaleExponent: round(measured.scale.exponent, 3),
      sinkFraction: round(measured.sink.meanFraction, 4),
      form,
      orientation: "radial",
      materialFamily: kind === "grass-blade" ? "terrain-ground" : "shore-rock",
    };
  });

  if (sprites.length > 0) {
    const width = sprites.map((sprite) => sprite.bounds.max[0] - sprite.bounds.min[0]);
    // Cloud sprites are wide and flat, not round: measured, their height is 0.542
    // of their width. A unit sphere stood in for them, so every cloud was twice as
    // tall as the authored one it replaced and the population reached a thousand
    // units past the authored band in both directions.
    const aspect =
      sprites.reduce(
        (sum, sprite) =>
          sum +
          (sprite.bounds.max[1] - sprite.bounds.min[1]) /
            (sprite.bounds.max[0] - sprite.bounds.min[0]),
        0,
      ) / sprites.length;
    /**
     * The band the sprite *centres* occupy, not the band their extents reach.
     *
     * A sprite's world AABB already includes its own span, so taking the region
     * from the union of those boxes and then placing a form of the same span
     * inside it counts each cloud's radius twice — measured, that put the
     * population 2,440 units below the sea and 4,702 above it against an authored
     * -502 to 3,175. Each box is inset by its own half-span first, which is
     * exactly the set of positions the authored sprites were placed at.
     */
    const centreBand = (axis) => {
      const halves = sprites.map(
        (sprite) => (sprite.bounds.max[axis] - sprite.bounds.min[axis]) / 2,
      );
      return [
        Math.min(...sprites.map((sprite, index) => sprite.bounds.min[axis] + halves[index])),
        Math.max(...sprites.map((sprite, index) => sprite.bounds.max[axis] - halves[index])),
      ];
    };
    const [minX, maxX] = centreBand(0);
    const [minY, maxY] = centreBand(1);
    const [minZ, maxZ] = centreBand(2);
    // Cloud sprites are not instanced, so they have no instance matrices to read.
    // Their spans are measured one sprite at a time; the ladder over those spans
    // is flat and the sink is zero, declared as such rather than dressed up as a
    // measurement of something else.
    populations.push({
      coverId: "cover/sky-clouds",
      kind: "cloud",
      count: sprites.length,
      region: {
        shape: "sky-shell",
        center: [round((minX + maxX) / 2), round((minZ + maxZ) / 2)],
        radii: [round((maxX - minX) / 2), round((maxZ - minZ) / 2)],
        minHeight: round(minY),
        maxHeight: round(maxY),
        innerRadius: 0.25,
        outerRadius: 1,
      },
      spanRange: [round(Math.min(...width)), round(Math.max(...width))],
      scaleRange: [round(Math.min(...width) / 2), round(Math.max(...width) / 2)],
      scaleExponent: 1,
      sinkFraction: 0,
      form: { extent: [2, round(2 * aspect, 4), 2], originHeight: round(aspect, 4) },
      orientation: "radial",
      materialFamily: "ocean-surface",
      heightRange: [round(minY), round(maxY)],
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
    // The authored surface animates its normal map and the Frozen Observation
    // Clock pins `performance.now()`, so the reference renders one repeatable
    // phase and its own frame delta is zero. The candidate reaches the same
    // repeatability by declaring the phase instead of reading a clock.
    phase: 0,
    // Standing in for the authored normal map's four tilings: `Water` divides
    // world XY by 103, 107, 1091 and 8907 at `size` 2, which is two fine bands
    // near fifty units and two long swells. Amplitudes are slopes, not heights:
    // the surface stays flat on the datum and only its normal moves, exactly as
    // the authored one does.
    waveBands: [
      { wavelength: 51.5, amplitude: 0.09, angle: 0.34 },
      { wavelength: 53.5, amplitude: 0.08, angle: 1.92 },
      { wavelength: 545, amplitude: 0.55, angle: 0.82 },
      { wavelength: 4450, amplitude: 2.6, angle: 2.51 },
    ],
  },
  /**
   * The cloud shell's own appearance, measured from the 34 authored sprites'
   * materials rather than borrowed from a surface family.
   *
   * They are white at every sprite and transparent at a mean opacity of 0.9546,
   * carried through the sprite's own soft puff texture. The texture cannot enter
   * production, so the softness is the standard soft-particle falloff in
   * `material-families.js`; the colour and the opacity are the sprites' measured
   * values. Before this the population pointed at `ocean-surface`, which drew the
   * sky full of opaque teal balls once the clouds were given their measured size.
   */
  clouds: {
    color: 0xffffff,
    opacity: 0.9546,
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

function buildRecipe(
  inventory,
  elevation,
  horizonEvidence,
  fittedRidges,
  coverInstances,
  measuredAlbedo,
  plateCoverage,
  surfaceSamples,
  bridgeAssets,
) {
  const entities = buildEntities(
    inventory,
    horizonEvidence,
    fittedRidges,
    plateCoverage,
    surfaceSamples,
    bridgeAssets,
  );
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
    materialFamilies: materialFamilies(measuredAlbedo),
    entities,
    populations: buildPopulations(inventory, coverInstances),
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
  const [inventory, elevation, horizonEvidence, coverInstances] = await Promise.all([
    readFile(INVENTORY_PATH, "utf8").then(JSON.parse),
    readFile(ELEVATION_PATH, "utf8").then(JSON.parse),
    readFile(HORIZON_PATH, "utf8").then(JSON.parse),
    readFile(COVER_INSTANCES_PATH, "utf8").then(JSON.parse),
  ]);
  assert.equal(inventory.schemaVersion, "scene-inventory-v1");
  assert.equal(elevation.schemaVersion, "terrain-elevation-v1");
  assert.equal(horizonEvidence.schemaVersion, "horizon-evidence-v1");
  assert.equal(coverInstances.schemaVersion, "cover-instances-v1");

  let fittedRidges = null;
  try {
    fittedRidges = JSON.parse(await readFile(FITTED_HORIZON_RIDGE_PATH, "utf8"));
    assert.equal(fittedRidges.schemaVersion, "horizon-ridge-fit-v1");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  // Plate coverage and the samples reach is inverted from. Both optional: on a
  // clean checkout the plate kinds fall back to the filled plate they were.
  const plateCoverage = new Map();
  const bridgeAssets = new Map();
  let surfaceSamples = { samples: {} };
  try {
    const plate = JSON.parse(await readFile(PLATE_FOOTPRINT_PATH, "utf8"));
    assert.equal(plate.schemaVersion, "plate-footprint-v1");
    for (const asset of plate.assets) {
      if (BRIDGE_CONTROL_KINDS.includes(asset.kind)) {
        for (const semanticId of asset.placements) bridgeAssets.set(semanticId, asset);
      }
      if (!PLATE_CONTROL_KINDS.includes(asset.kind)) continue;
      for (const semanticId of asset.placements) plateCoverage.set(semanticId, asset.coverage);
    }
    surfaceSamples = JSON.parse(await readFile(SURFACE_SAMPLES_PATH, "utf8"));
    assert.equal(surfaceSamples.schemaVersion, "scene-surface-samples-v1");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  let measuredAlbedo = null;
  try {
    measuredAlbedo = JSON.parse(await readFile(MATERIAL_ALBEDO_PATH, "utf8"));
    assert.equal(measuredAlbedo.schemaVersion, "material-albedo-v1");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const recipe = buildRecipe(
    inventory,
    elevation,
    horizonEvidence,
    fittedRidges,
    coverInstances,
    measuredAlbedo,
    plateCoverage,
    surfaceSamples,
    bridgeAssets,
  );
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
