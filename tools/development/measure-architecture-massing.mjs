/**
 * What an authored building's mass actually looks like, by height.
 *
 * Human Parity Review named the village as the largest remaining geometry residual,
 * and the measurements agree: `structures` carries the worst per-group depth p95 in
 * the fixed-camera layer at 117.19 against a threshold of 22.35, `bridges` draws 2.11
 * times the reference's pixels and `plazas` 1.89. None of those are terrain-blocked —
 * a building is 18.9 units thick against 7.1 units of terrain misfit beneath it — so
 * unlike the paving slabs they are the generator's own to fix.
 *
 * Before changing the generator, this measures the subject, because ticket 05 spent
 * two rounds fitting a guess before anyone read the authored mesh and the shape was
 * obvious once they did.
 *
 * Two profiles per kind, pooled over its placements and normalised into each
 * entity's own box so buildings of different sizes are comparable:
 *
 * - **occupancy by height decile**, which says where the mass is: a platform reads as
 *   a spike at the bottom, a tall body as a flat middle, a roof as a taper.
 * - **mean horizontal half-extent by height decile**, which says what the silhouette
 *   does: a pyramid narrows monotonically, and a flared eave *widens* before it
 *   narrows. That distinction is the whole difference between the candidate's cone
 *   roof and an authored one, and no single number can carry it.
 *
 * Both subjects are measured the same way from the same samples the surface gate
 * uses, so a difference here is a difference the gate sees.
 *
 *   node tools/development/measure-architecture-massing.mjs
 *   node tools/development/measure-architecture-massing.mjs --kinds shop-stall,pavilion
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ISLAND_SCENE_RECIPE } from "../../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { generateScene } from "../../gt_designer/src/reconstruction/scene/scene-generator.js";
import { observeAuthoredReference } from "../evaluation/scene-observation.mjs";
import { sampleEntitySurface } from "../evaluation/surface-sampling.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EVIDENCE = path.join(PROJECT_ROOT, ".scratch/scene-parity-foundation/evidence");
const readEvidence = (name) => readFile(path.join(EVIDENCE, name), "utf8").then(JSON.parse);

const argv = process.argv.slice(2);
const flag = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
};

const [inventory, samples] = await Promise.all([
  readEvidence("scene-inventory-v1.json"),
  readEvidence("scene-surface-samples-v1.json"),
]);
const reference = observeAuthoredReference({ inventory, samples });
const { semanticIndex } = generateScene(ISLAND_SCENE_RECIPE);

const DECILES = 10;

/**
 * One entity's mass profile in its own normalised box.
 *
 * `share` is the fraction of the entity's sampled geometry in each height decile.
 * `halfExtent` is the mean horizontal distance from the entity's own vertical axis,
 * as a fraction of half its footprint — so 1.0 means the mass reaches the edge of its
 * bounding box and a value that rises with height is a flare.
 */
function profile(points) {
  if (!points || points.length < 9) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < points.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = points[index + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  if (!(size[1] > 0)) return null;
  const centre = [(min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2];
  const half = [Math.max(1e-6, size[0] / 2), 0, Math.max(1e-6, size[2] / 2)];

  const counts = new Array(DECILES).fill(0);
  const reach = new Array(DECILES).fill(0);
  for (let index = 0; index < points.length; index += 3) {
    const level = Math.min(
      DECILES - 1,
      Math.floor(((points[index + 1] - min[1]) / size[1]) * DECILES),
    );
    counts[level] += 1;
    // Normalised by each axis's own half-size, so a long thin hall and a square
    // pavilion are compared on proportion rather than on absolute width.
    const u = (points[index] - centre[0]) / half[0];
    const w = (points[index + 2] - centre[2]) / half[2];
    reach[level] += Math.max(Math.abs(u), Math.abs(w));
  }
  const total = counts.reduce((sum, value) => sum + value, 0);
  return {
    share: counts.map((count) => count / total),
    halfExtent: counts.map((count, level) => (count > 0 ? reach[level] / count : null)),
    aspect: size[1] / Math.max(size[0], size[2]),
  };
}

function pool(profiles) {
  const kept = profiles.filter(Boolean);
  if (kept.length === 0) return null;
  const share = new Array(DECILES).fill(0);
  const halfExtent = new Array(DECILES).fill(0);
  const seen = new Array(DECILES).fill(0);
  for (const entry of kept) {
    for (let level = 0; level < DECILES; level += 1) {
      share[level] += entry.share[level];
      if (entry.halfExtent[level] !== null) {
        halfExtent[level] += entry.halfExtent[level];
        seen[level] += 1;
      }
    }
  }
  return {
    count: kept.length,
    aspect: kept.reduce((sum, entry) => sum + entry.aspect, 0) / kept.length,
    share: share.map((value) => value / kept.length),
    halfExtent: halfExtent.map((value, level) => (seen[level] > 0 ? value / seen[level] : null)),
  };
}

const requested = flag("--kinds")?.split(",").map((value) => value.trim());
const structures = ISLAND_SCENE_RECIPE.entities.filter((entity) =>
  ["structures", "bridges", "plazas"].includes(entity.group),
);
const kinds = requested ?? [...new Set(structures.map((entity) => entity.kind))];

const bar = (value) => "#".repeat(Math.max(0, Math.round(value * 40)));
for (const kind of kinds) {
  const entities = structures.filter((entity) => entity.kind === kind);
  if (entities.length === 0) continue;
  const referenceProfiles = [];
  const candidateProfiles = [];
  for (const entity of entities) {
    const observed = reference.entities.get(entity.semanticId);
    const node = semanticIndex.get(entity.semanticId);
    referenceProfiles.push(profile(observed?.samples));
    if (node) {
      const holder = node.object ?? node.node ?? node;
      candidateProfiles.push(profile(sampleEntitySurface(holder)));
    }
  }
  const left = pool(referenceProfiles);
  const right = pool(candidateProfiles);
  if (!left || !right) continue;

  process.stdout.write(
    `\n${kind}  (${entities.length} placements, authored aspect ${left.aspect.toFixed(2)}, ` +
      `candidate ${right.aspect.toFixed(2)})\n` +
      "  height   authored share            candidate share          authored / candidate reach\n",
  );
  for (let level = DECILES - 1; level >= 0; level -= 1) {
    const reachPair =
      left.halfExtent[level] === null || right.halfExtent[level] === null
        ? "      -    "
        : `${left.halfExtent[level].toFixed(2)} / ${right.halfExtent[level].toFixed(2)}`;
    process.stdout.write(
      `  ${String(level).padStart(2)}   ` +
        `${(left.share[level] * 100).toFixed(1).padStart(5)}% ${bar(left.share[level]).padEnd(22)}` +
        `${(right.share[level] * 100).toFixed(1).padStart(5)}% ${bar(right.share[level]).padEnd(22)}` +
        reachPair +
        "\n",
    );
  }
}
