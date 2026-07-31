/**
 * The surface metric's own noise floor, per kind.
 *
 * `surfaceDistance` compares two point clouds, and `SAMPLE_CAP` is 96 for every entity on
 * the island regardless of its size. Two independent 96-point samplings of the *same*
 * surface are not the same 96 points, so the metric reads a non-zero distance between a
 * form and itself, and that reading grows with the entity: points spread over a 125-unit
 * plaza sit about fourteen units apart, and over a kilometre-wide mountain far further.
 *
 * This measures that floor directly. Each candidate entity is sampled twice — once with
 * the production seeds and once with the seeds displaced — and the two clouds are compared
 * with the gate's own function. Nothing about the form differs between the two, so whatever
 * comes back is what the metric reads when the answer is exactly right.
 *
 * The reason this matters is that the gate's thresholds are absolute world units. If a
 * kind's floor is near its threshold, no amount of fitting can pass it, and a fitting
 * effort spent there is spent against sampling noise.
 *
 *   node tools/development/measure-surface-metric-floor.mjs
 *   node tools/development/measure-surface-metric-floor.mjs --repeats 5
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ISLAND_SCENE_RECIPE } from "../../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { generateScene } from "../../gt_designer/src/reconstruction/scene/scene-generator.js";
import {
  allocateSamples,
  sampleBudget,
  sampleMeshSurface,
  surfaceAreaOf,
  surfaceDistance,
  triangleCountOf,
} from "../evaluation/surface-sampling.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const flagValue = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : fallback;
};
const REPEATS = Number(flagValue("--repeats", "3"));
const TOLERANCE = 1;

const correspondence = JSON.parse(
  await readFile(
    path.join(PROJECT_ROOT, ".scratch/scene-parity-foundation/evidence/scene-correspondence-v1.json"),
    "utf8",
  ),
);

/**
 * `sampleEntitySurface` with the per-mesh seed displaced.
 *
 * The production call seeds mesh `i` with `i + 1`. Everything else here — the budget, the
 * area-weighted allocation, the traversal order — is identical to it on purpose: the only
 * difference between the two clouds must be which points on the surface were drawn.
 */
function sampleWithOffset(root, offset) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  const triangleCounts = meshes.map((mesh) => triangleCountOf(mesh.geometry));
  const budget = sampleBudget(triangleCounts.reduce((sum, count) => sum + count, 0));
  const allocation = allocateSamples(meshes.map(surfaceAreaOf), budget);
  const samples = [];
  meshes.forEach((mesh, index) => {
    samples.push(...sampleMeshSurface(mesh, index + 1 + offset, allocation[index]));
  });
  return samples;
}

const { semanticIndex } = generateScene(ISLAND_SCENE_RECIPE);
const byKind = new Map();
for (const entity of ISLAND_SCENE_RECIPE.entities) {
  const node = semanticIndex.get(entity.semanticId);
  if (!node) continue;
  const holder = node.object ?? node.node ?? node;
  const floors = [];
  for (let repeat = 1; repeat <= REPEATS; repeat += 1) {
    const left = sampleWithOffset(holder, 0);
    const right = sampleWithOffset(holder, repeat * 1013);
    const measured = surfaceDistance(left, right, TOLERANCE);
    if (measured) floors.push(measured.symmetric.p95);
  }
  if (floors.length === 0) continue;
  const floor = floors.reduce((sum, value) => sum + value, 0) / floors.length;
  const extent = Math.max(...entity.extent);
  const row = byKind.get(entity.kind) ?? { kind: entity.kind, count: 0, floor: 0, extent: 0 };
  row.count += 1;
  row.floor += floor;
  row.extent += extent;
  byKind.set(entity.kind, row);
}

const rows = [...byKind.values()].map((row) => ({
  kind: row.kind,
  count: row.count,
  floor: row.floor / row.count,
  extent: row.extent / row.count,
  measured: correspondence.surface.byKind[row.kind]?.mean ?? null,
}));
rows.sort((left, right) => right.floor - left.floor);

process.stdout.write(
  `The surface metric compared with itself, ${REPEATS} redraws per entity, ` +
    `96 samples per entity at every size\n\n`,
);
process.stdout.write(
  `  ${"kind".padEnd(17)}${"n".padStart(4)}${"mean extent".padStart(13)}` +
    `${"floor p95".padStart(11)}${"measured".padStart(10)}${"floor share".padStart(13)}\n`,
);
let weightedFloor = 0;
let weightedMeasured = 0;
let total = 0;
for (const row of rows) {
  const share = row.measured > 0 ? (row.floor / row.measured) * 100 : null;
  process.stdout.write(
    `  ${row.kind.padEnd(17)}${String(row.count).padStart(4)}${row.extent.toFixed(1).padStart(13)}` +
      `${row.floor.toFixed(3).padStart(11)}${(row.measured?.toFixed(3) ?? "-").padStart(10)}` +
      `${(share === null ? "-" : `${share.toFixed(1)}%`).padStart(13)}\n`,
  );
  weightedFloor += row.floor * row.count;
  weightedMeasured += (row.measured ?? 0) * row.count;
  total += row.count;
}
process.stdout.write(
  `\n  entity-weighted floor ${(weightedFloor / total).toFixed(4)} against a measured ` +
    `${(weightedMeasured / total).toFixed(4)}, threshold 2.4875\n`,
);
