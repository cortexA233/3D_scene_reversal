/**
 * Whether each kind's surface distance is symmetric, and what it means when it is
 * not.
 *
 * Scene Surface Parity gates a *symmetric* point-set distance, and the aggregate
 * keeps only that. The two directions say different things, though, and the
 * difference is diagnostic:
 *
 * - reference to candidate large means the candidate does not cover the reference —
 *   something authored is missing.
 * - candidate to reference large means the candidate has surface where the reference
 *   has no *sample*, which is either bulk the reference does not have or geometry
 *   the reference has and the sampler did not reach.
 *
 * Measured, `bamboo` is the only kind that is badly asymmetric: 4.27 one way against
 * 39.43 the other, while palm reads 6.20/4.53, blossom 3.13/3.68, rock 5.61/5.33 and
 * bamboo-bed 1.97/2.21. So the candidate's canopy covers the authored one and the
 * whole penalty is one-directional.
 *
 * The cause is the sampler's own allocation. `sampleEntitySurface` gives every mesh
 * in an entity its own budget of `min(96, max(12, sqrt(triangles) * 3))`, which is
 * sub-linear and floored, so a small part is sampled far more densely than its share
 * of the entity. An authored placement is one mesh of 19,908 triangles whose culms
 * are about three parts in a thousand, and 96 triangle-uniform samples therefore
 * never land on them. A generated clump carrying the semantic parts the milestone
 * requires — culms and foliage — gives its culms a floor of twelve samples however
 * few triangles they have, and every one of those measures its distance to a canopy.
 *
 * That penalises semantic part structure, which ticket 10 exists to add. Fixing it
 * means allocating an entity's budget across its meshes in proportion rather than
 * per mesh, which changes the frozen reference samples and moves the world-geometry
 * layer's thresholds, so it is a deliberate re-measurement rather than a free change.
 *
 *   node tools/development/measure-surface-sampling-symmetry.mjs
 *   node tools/development/measure-surface-sampling-symmetry.mjs --kinds bamboo,palm
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ISLAND_SCENE_RECIPE } from "../../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { generateScene } from "../../gt_designer/src/reconstruction/scene/scene-generator.js";
import { observeAuthoredReference } from "../evaluation/scene-observation.mjs";
import { sampleEntitySurface, surfaceDistance } from "../evaluation/surface-sampling.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EVIDENCE = path.join(PROJECT_ROOT, ".scratch/scene-parity-foundation/evidence");
const readEvidence = (name) =>
  readFile(path.join(EVIDENCE, name), "utf8").then(JSON.parse);

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

/** The world-geometry layer's own surface tolerance, so the fraction means what it does at acceptance. */
const TOLERANCE = 2.3479;

const requested = flag("--kinds")?.split(",").map((value) => value.trim());
const kinds = requested ?? [
  ...new Set(ISLAND_SCENE_RECIPE.entities.map((entity) => entity.kind)),
];

const rows = [];
for (const kind of kinds) {
  const entities = ISLAND_SCENE_RECIPE.entities.filter((entity) => entity.kind === kind);
  const forward = [];
  const backward = [];
  const referenceSamples = [];
  const candidateSamples = [];
  const parts = [];
  for (const entity of entities) {
    const observed = reference.entities.get(entity.semanticId);
    const node = semanticIndex.get(entity.semanticId);
    if (!observed?.samples?.length || !node) continue;
    const holder = node.object ?? node.node ?? node;
    const candidate = sampleEntitySurface(holder);
    if (candidate.length === 0) continue;
    const distance = surfaceDistance(observed.samples, candidate, TOLERANCE);
    if (!distance) continue;
    forward.push(distance.referenceToCandidate.p95);
    backward.push(distance.candidateToReference.p95);
    referenceSamples.push(observed.samples.length / 3);
    candidateSamples.push(candidate.length / 3);
    let meshes = 0;
    holder.traverse((child) => {
      if (child.isMesh) meshes += 1;
    });
    parts.push(meshes);
  }
  if (forward.length === 0) continue;
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  rows.push({
    kind,
    count: forward.length,
    forward: mean(forward),
    backward: mean(backward),
    // Above one, the candidate is being measured against samples the reference does
    // not have where it does have geometry.
    asymmetry: mean(backward) / Math.max(1e-6, mean(forward)),
    referenceSamples: mean(referenceSamples),
    candidateSamples: mean(candidateSamples),
    parts: mean(parts),
  });
}

rows.sort((a, b) => b.asymmetry - a.asymmetry);
process.stdout.write(
  "kind".padEnd(18) +
    "n".padStart(5) +
    "ref->cand".padStart(11) +
    "cand->ref".padStart(11) +
    "ratio".padStart(8) +
    "refSmp".padStart(8) +
    "candSmp".padStart(9) +
    "parts".padStart(7) +
    "\n",
);
for (const row of rows) {
  process.stdout.write(
    row.kind.padEnd(18) +
      String(row.count).padStart(5) +
      row.forward.toFixed(2).padStart(11) +
      row.backward.toFixed(2).padStart(11) +
      row.asymmetry.toFixed(2).padStart(8) +
      Math.round(row.referenceSamples).toString().padStart(8) +
      Math.round(row.candidateSamples).toString().padStart(9) +
      row.parts.toFixed(1).padStart(7) +
      "\n",
  );
}
