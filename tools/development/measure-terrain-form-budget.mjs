/**
 * What the Bounded Semantic Terrain Program's landform budget can and cannot
 * reach, measured rather than argued.
 *
 * Ticket 03's last requirement is that a budget which cannot reach its threshold
 * be recorded as a representation boundary with an ADR rather than grown. That
 * needs a number: the frozen budget of 40 named analytic landforms gets terrain
 * height p95 to 8.53 against a threshold of 5.26875, and the question is whether
 * the remaining 3.3 units are a better fit waiting to be found or a property of
 * fitting a 600-unit island with 40 analytic forms.
 *
 * So this runs the production fitter's own landform pursuit at increasing budgets
 * and reports what each one reaches. Matching pursuit is greedy, so each result is
 * an upper bound on the error achievable with that many forms; a budget whose
 * curve is still falling steeply at 40 says the fit has headroom, and one that has
 * flattened says the representation has not.
 *
 * Reference-only and offline: it reads the frozen elevation evidence and the
 * production terrain field, and it never renders or reads a candidate report. The
 * programs it builds past the frozen budget exist only inside this measurement and
 * are never written anywhere — `validateTerrainProgram` would refuse them, which
 * is the point.
 *
 *   node tools/development/measure-terrain-form-budget.mjs
 *   node tools/development/measure-terrain-form-budget.mjs --budgets 10,20,40,80
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { REFERENCE_LAYOUT } from "../../gt_designer/full-island-layout.generated.js";
import {
  TERRAIN_PROGRAM_VERSION,
  createCoastlineCurve,
  createTerrainProgramField,
} from "../../gt_designer/src/reconstruction/scene/terrain-program.js";
import { ISLAND_SCENE_RECIPE } from "../../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { elevationSampler, fitLandforms } from "../reconstruction/fit-terrain-program.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const EVIDENCE_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence/terrain-elevation-v1.json",
);

const argv = process.argv.slice(2);
const flag = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
};
const budgets = (flag("--budgets") ?? "10,20,40,80,160,320")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);

const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
const sampler = elevationSampler(evidence);
const recipe = ISLAND_SCENE_RECIPE.terrain;
const radiusAt = createCoastlineCurve(recipe.coastline.nodes);
const [centreX, centreZ] = recipe.coastline.center;

/**
 * The shoreline radii the fitter works against, re-traced here so this tool does
 * not depend on the order the recipe builder happens to run in.
 */
function traceRadii() {
  const sweep = 720;
  const radii = [];
  for (let index = 0; index < sweep; index += 1) {
    radii.push(radiusAt((index / sweep) * Math.PI * 2));
  }
  return radii;
}

/**
 * The same three regions the geography evidence gates, so a number here is
 * comparable to the number acceptance reads. Probes come off the frozen 257-square
 * elevation grid rather than a grid of this tool's own, because a fit measured at a
 * resolution the gate does not use is not evidence about the gate.
 */
function heightResidual(field) {
  const { resolution, bounds } = evidence;
  const bands = { full: [], interior: [], shore: [] };
  for (let row = 0; row < resolution; row += 2) {
    for (let column = 0; column < resolution; column += 2) {
      const x = bounds.x0 + ((bounds.x1 - bounds.x0) * column) / (resolution - 1);
      const z = bounds.z0 + ((bounds.z1 - bounds.z0) * row) / (resolution - 1);
      if (!sampler.inRange(x, z)) continue;
      const reference = sampler.at(x, z);
      if (!Number.isFinite(reference)) continue;
      const normalised =
        Math.hypot(x - centreX, z - centreZ) /
        Math.max(1e-3, radiusAt(Math.atan2(z - centreZ, x - centreX)));
      if (normalised > 1.15) continue;
      const error = Math.abs(field(x, z) - reference);
      bands.full.push(error);
      if (normalised <= 0.8) bands.interior.push(error);
      else bands.shore.push(error);
    }
  }
  const summarise = (values) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: sorted.length,
      mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)),
      p95: Number(sorted[Math.floor(0.95 * (sorted.length - 1))].toFixed(4)),
      max: Number(sorted[sorted.length - 1].toFixed(4)),
    };
  };
  return {
    full: summarise(bands.full),
    interior: summarise(bands.interior),
    shore: summarise(bands.shore),
  };
}

function programWith(landforms) {
  return createTerrainProgramField({
    version: TERRAIN_PROGRAM_VERSION,
    coastline: recipe.coastline,
    landforms,
    shore: recipe.shore,
    noise: recipe.noise,
    seaLevel: recipe.seaLevel,
    groundY: recipe.groundY,
    oceanFloor: recipe.oceanFloor,
  });
}

const radii = traceRadii();
const baseField = programWith([]);
const THRESHOLD = 5.26875;

process.stdout.write(
  `terrain height residual against the frozen threshold of ${THRESHOLD}\n` +
    "landforms are fitted by the production pursuit; each row is an upper bound for that budget\n\n",
);
process.stdout.write(
  "budget  placed  full p95  full mean  interior p95  shore p95  reaches threshold\n",
);
const rows = [];
for (const budget of budgets) {
  const { landforms } = fitLandforms(sampler, baseField, [centreX, centreZ], radii, budget);
  const residual = heightResidual(programWith(landforms));
  rows.push({ budget, placed: landforms.length, residual });
  process.stdout.write(
    String(budget).padStart(6) +
      String(landforms.length).padStart(8) +
      residual.full.p95.toFixed(3).padStart(10) +
      residual.full.mean.toFixed(3).padStart(11) +
      residual.interior.p95.toFixed(3).padStart(14) +
      residual.shore.p95.toFixed(3).padStart(11) +
      (residual.full.p95 <= THRESHOLD ? "  yes" : "  no").padStart(19) +
      "\n",
  );
}

// The shape of the curve is the finding, not any single row: a fit still falling
// steeply at the frozen budget has headroom, and one that has flattened does not.
const marginal = [];
for (let index = 1; index < rows.length; index += 1) {
  const before = rows[index - 1];
  const after = rows[index];
  const doubling = Math.log2(after.placed / Math.max(1, before.placed));
  if (doubling <= 0) continue;
  marginal.push(
    `${before.placed} to ${after.placed} forms: ${(before.residual.full.p95 - after.residual.full.p95).toFixed(3)} ` +
      `units of p95 per ${doubling.toFixed(2)} doublings`,
  );
}
process.stdout.write(`\n${marginal.join("\n")}\n`);
void REFERENCE_LAYOUT;
