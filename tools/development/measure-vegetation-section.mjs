/**
 * What an authored plant's mass looks like in a vertical section.
 *
 * `measure-architecture-massing.mjs` reports the *mean* horizontal half-extent per
 * height decile, which is the right summary for a building — a wall is at one radius
 * and the mean finds it. A plant is not built like that. A palm is a thin trunk inside
 * a wide crown, so at a crown decile the samples sit at two radii at once and their
 * mean lands in the empty space between them. That summary said the authored palm's
 * reach is a nearly constant 0.5 from base to tip, which is true and tells you nothing
 * about whether it is a column, a cone, or a trunk with a canopy around it.
 *
 * This prints the whole radial distribution instead: for each height decile, what
 * fraction of that decile's samples sit in each radial band. A trunk is a spike in the
 * innermost band, a canopy is mass in the outer bands, and a plant that is both shows
 * both. The same samples the surface gate uses, so a difference here is one it sees.
 *
 *   node tools/development/measure-vegetation-section.mjs --kinds palm,blossom
 *   node tools/development/measure-vegetation-section.mjs --kinds palm --bands 8
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
const flag = (name, fallback = null) => {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : fallback;
};

const LEVELS = Number(flag("--levels", "10"));
const BANDS = Number(flag("--bands", "6"));
const BUDGET = Number(flag("--budget", "4096"));
const KINDS = (flag("--kinds", "palm") ?? "").split(",").filter(Boolean);
/**
 * Pool placements after turning each one to face the same way, and report a signed
 * left-to-right section instead of a radius.
 *
 * Without this the pooling destroys the thing worth seeing. A leaning or arcing trunk
 * sits off-centre at every height, but 156 placements at 156 different yaws smear that
 * offset into a ring, and the radial view reports a plant with no core and a constant
 * half-extent — which is what the unaligned run says about the palm and is an artefact of
 * the pooling, not a property of the subject. Each placement is turned so its own mean
 * horizontal offset points at +x first, which is a rotation about the entity's own axis
 * and so changes nothing the surface gate measures.
 */
const ALIGN = argv.includes("--align");

const [inventory, samples] = await Promise.all([
  readEvidence("scene-inventory-v1.json"),
  readEvidence("scene-surface-samples-v1.json"),
]);
const reference = observeAuthoredReference({ inventory, samples });
const { semanticIndex } = generateScene(ISLAND_SCENE_RECIPE);

/**
 * Pools one side's samples for a kind into a level x band histogram.
 *
 * Every placement is normalised into its own axis-aligned box first — height onto
 * [0,1] and radius onto the box's own half-diagonal — so placements of different
 * sizes pool without the largest one deciding the answer.
 */
function section(points, box) {
  const [minX, minY, minZ] = box.min;
  const [maxX, maxY, maxZ] = box.max;
  const height = Math.max(1e-9, maxY - minY);
  const centreX = (minX + maxX) / 2;
  const centreZ = (minZ + maxZ) / 2;
  const halfX = Math.max(1e-9, (maxX - minX) / 2);
  const halfZ = Math.max(1e-9, (maxZ - minZ) / 2);
  const columns = ALIGN ? BANDS * 2 : BANDS;
  const grid = Array.from({ length: LEVELS }, () => new Float64Array(columns));
  let total = 0;

  // The placement's own facing: the direction of its mean horizontal offset, weighted
  // equally over its samples. Undefined for a form that really is centred, in which case
  // any direction will do and +x is taken.
  let facingX = 1;
  let facingZ = 0;
  if (ALIGN) {
    let sumX = 0;
    let sumZ = 0;
    for (let index = 0; index + 2 < points.length; index += 3) {
      sumX += (points[index] - centreX) / halfX;
      sumZ += (points[index + 2] - centreZ) / halfZ;
    }
    const magnitude = Math.hypot(sumX, sumZ);
    if (magnitude > 1e-9) {
      facingX = sumX / magnitude;
      facingZ = sumZ / magnitude;
    }
  }

  // Samples are stored flat, as the surface gate stores them: x, y, z, x, y, z.
  for (let index = 0; index + 2 < points.length; index += 3) {
    const level = Math.min(
      LEVELS - 1,
      Math.max(0, Math.floor(((points[index + 1] - minY) / height) * LEVELS)),
    );
    // Normalised per axis, so an entity whose box is not square does not read as
    // off-centre mass purely because of its footprint's aspect.
    const dx = (points[index] - centreX) / halfX;
    const dz = (points[index + 2] - centreZ) / halfZ;
    let column;
    if (ALIGN) {
      // Signed distance along the placement's own facing, over [-1, 1].
      const along = Math.max(-1, Math.min(1, dx * facingX + dz * facingZ));
      column = Math.min(columns - 1, Math.max(0, Math.floor(((along + 1) / 2) * columns)));
    } else {
      const radius = Math.min(1, Math.hypot(dx, dz) / Math.SQRT2);
      column = Math.min(columns - 1, Math.max(0, Math.floor(radius * columns)));
    }
    grid[level][column] += 1;
    total += 1;
  }
  return { grid, total };
}

const boxOf = (points) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index + 2 < points.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = points[index + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return { min, max };
};

// Ramped over a level's radial share, where an even spread across the bands is the
// reference point: 1/BANDS lands mid-ramp, so a trunk spike and an empty core are
// both immediately visible against it.
const RAMP = " .:-=+*#%@";
const cell = (share) => {
  if (!(share > 0)) return " ";
  const relative = share * (ALIGN ? BANDS * 2 : BANDS);
  const index = Math.min(RAMP.length - 1, Math.max(1, Math.round(relative * 2.5)));
  return RAMP[index];
};

for (const kind of KINDS) {
  const entities = ISLAND_SCENE_RECIPE.entities.filter((entity) => entity.kind === kind);
  if (entities.length === 0) {
    process.stdout.write(`${kind}: no placements\n\n`);
    continue;
  }
  const sides = { authored: null, candidate: null };
  for (const side of ["authored", "candidate"]) {
    const pooled = Array.from({ length: LEVELS }, () => new Float64Array(ALIGN ? BANDS * 2 : BANDS));
    let placements = 0;
    for (const entity of entities) {
      let points;
      if (side === "authored") {
        points = reference.entities.get(entity.semanticId)?.samples;
      } else {
        const node = semanticIndex.get(entity.semanticId);
        const holder = node ? (node.object ?? node.node ?? node) : null;
        points = holder ? sampleEntitySurface(holder, { budget: BUDGET }) : null;
      }
      if (!points || points.length === 0) continue;
      const { grid, total } = section(points, boxOf(points));
      if (total === 0) continue;
      for (let level = 0; level < LEVELS; level += 1) {
        for (let band = 0; band < pooled[level].length; band += 1) {
          pooled[level][band] += grid[level][band] / total;
        }
      }
      placements += 1;
    }
    sides[side] = { pooled, placements };
  }

  process.stdout.write(
    `${kind}  (${sides.authored.placements} placements, ${LEVELS} levels x ${BANDS} radial bands)\n`,
  );
  process.stdout.write(
    `  ${"".padEnd(6)}${"authored  (core -> rim)".padEnd(BANDS + 12)}${"candidate (core -> rim)"}\n`,
  );
  for (let level = LEVELS - 1; level >= 0; level -= 1) {
    /**
     * Each level's radial profile is normalised to that level's own total, not to the
     * whole entity's. The question here is where the mass sits *at a given height* —
     * trunk, canopy, or both — and a level holding 5 per cent of a plant answers it
     * just as definitely as one holding 35. The level's own share is printed beside
     * the row so a nearly empty level cannot be mistaken for a full one.
     */
    const row = (side) => {
      const counts = sides[side].pooled[level];
      let sum = 0;
      for (const value of counts) sum += value;
      if (!(sum > 0)) return " ".repeat(ALIGN ? BANDS * 2 : BANDS);
      return Array.from(counts, (value) => cell(value / sum)).join("");
    };
    const share = (side) => {
      const counts = sides[side].pooled[level];
      const scale = sides[side].placements || 1;
      let sum = 0;
      for (const value of counts) sum += value;
      return `${((sum / scale) * 100).toFixed(1)}%`.padStart(6);
    };
    process.stdout.write(
      `  ${String(level).padStart(2)}  |${row("authored")}|${share("authored")}` +
        `   |${row("candidate")}|${share("candidate")}\n`,
    );
  }
  process.stdout.write("\n");
}
