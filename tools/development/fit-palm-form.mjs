/**
 * Fit the palm's form controls to its measured profile.
 *
 * `palm` is the largest single contributor to the failing surface gate after the horizon
 * — 18.7 per cent over 156 placements — and it was hand-authored constants that had never
 * been compared with the subject. ADR-0065 records why the Axial Layer Family is not the
 * route here. This fits the form it already has.
 *
 * Scoring is on the pooled share and reach profiles rather than on surface distance,
 * because a `generateSceneObject` call is milliseconds and a correspondence run is not,
 * and because the profile is normalised into the object's own box — which is exactly what
 * the Target AABB Extent contract does at placement, so a score here is placement-free.
 * The profile is a proxy and is treated as one: the chosen candidate is put through
 * `run-scene-correspondence.mjs` and judged on `surface.p95.mean`, which is the gate.
 *
 *   node tools/development/fit-palm-form.mjs
 *   node tools/development/fit-palm-form.mjs --seeds 12
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { generateSceneObject } from "../../gt_designer/src/reconstruction/scene/scene-object-generators.js";
import { sampleEntitySurface } from "../evaluation/surface-sampling.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : fallback;
};
const SEEDS = Number(flag("--seeds", "10"));
const KIND = flag("--kind", "palm");
/** The shipped defaults per kind, as the search's starting point. */
const STARTS = {
  palm: { trunkHeight: 0.62, trunkBase: 0.09, trunkTop: 0.028, crownSpan: 0.5, whorls: 5, lengthScale: 1, widthScale: 0.7 },
  blossom: { trunkFraction: 0.12, clusters: 10, spread: 0.6, baseRadius: 0.07, crownLow: 0 },
  bamboo: { canopyFloor: 0.6, lengthScale: 1, droop: 0.14, riseLow: 0.35, radiusScale: 0.46 },
};
const PALM_START = STARTS[KIND];

/**
 * The standing canopy minima, from `test/vegetation-reconstruction.test.mjs`.
 *
 * A search that ignores these finds forms it is not allowed to ship. Blossom's first run
 * did exactly that: it took clusters from ten to eight, scored well, and produced a 548
 * triangle canopy against a 600 minimum that exists because a crown of sparse facets reads
 * as sticks at overview distance however well its profile fits. The constraint belongs in
 * the search, not in a patch afterwards, so an infeasible candidate is rejected before it
 * is ever scored.
 */
const CANOPY_MINIMUM = { palm: 400, blossom: 600, bamboo: 500 };

function triangleCount(controls) {
  const object = generateSceneObject(KIND, 991, controls ? { [`${KIND}Form`]: controls } : undefined);
  let triangles = 0;
  object.traverse((child) => {
    if (!child.isMesh) return;
    const position = child.geometry.attributes.position;
    const index = child.geometry.index;
    triangles += Math.floor((index ? index.count : position.count) / 3);
  });
  return triangles;
}

const feasible = (controls) =>
  !(KIND in CANOPY_MINIMUM) || triangleCount(controls) >= CANOPY_MINIMUM[KIND];
const DECILES = 10;

const massing = JSON.parse(
  await readFile(
    path.join(PROJECT_ROOT, ".scratch/full-island-reconstruction/evidence/axial-massing-v1.json"),
    "utf8",
  ),
);
const authored = massing.kinds.find((row) => row.kind === KIND).authored;

/**
 * The massing tool's profile, recomputed here from an object rather than from a scene.
 *
 * Through `sampleEntitySurface`, not through the vertex buffer. Reading vertices directly
 * would weight each one equally and so weight finely-tessellated regions more heavily —
 * a palm's blade tips carry far more vertices per unit area than its trunk — which is the
 * exact bias ADR-0061 found and removed from the shared sampler. Scoring a fit against a
 * differently-biased profile than the gate measures would fit the bias.
 */
function profileOf(object) {
  object.updateMatrixWorld(true);
  const positions = sampleEntitySurface(object, { budget: 8192 });
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  const height = Math.max(1e-9, max[1] - min[1]);
  const centre = [(min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2];
  const half = [Math.max(1e-6, (max[0] - min[0]) / 2), 0, Math.max(1e-6, (max[2] - min[2]) / 2)];
  const counts = new Array(DECILES).fill(0);
  const reach = new Array(DECILES).fill(0);
  for (let index = 0; index < positions.length; index += 3) {
    const decile = Math.min(
      DECILES - 1,
      Math.max(0, Math.floor(((positions[index + 1] - min[1]) / height) * DECILES)),
    );
    counts[decile] += 1;
    reach[decile] += Math.hypot(
      (positions[index] - centre[0]) / half[0],
      (positions[index + 2] - centre[2]) / half[2],
    );
  }
  const total = counts.reduce((sum, value) => sum + value, 0) || 1;
  return {
    share: counts.map((value) => value / total),
    reach: counts.map((value, decile) => (value > 0 ? reach[decile] / value : null)),
  };
}

/**
 * Distance from the authored profile.
 *
 * Share and reach are both dimensionless and both matter, so they are summed unweighted
 * rather than traded off by a constant nobody measured. A decile the subject never
 * samples contributes nothing.
 */
function score(candidate) {
  let total = 0;
  for (let decile = 0; decile < DECILES; decile += 1) {
    total += Math.abs(candidate.share[decile] - authored.share[decile]);
    if (authored.reach[decile] !== null && candidate.reach[decile] !== null) {
      total += Math.abs(candidate.reach[decile] - authored.reach[decile]);
    }
  }
  return total;
}

function pooled(kind, controls) {
  const share = new Array(DECILES).fill(0);
  const reach = new Array(DECILES).fill(0);
  const seen = new Array(DECILES).fill(0);
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const measured = profileOf(
      generateSceneObject(kind, 4242 + seed * 17, controls ? { [`${KIND}Form`]: controls } : undefined),
    );
    for (let decile = 0; decile < DECILES; decile += 1) {
      share[decile] += measured.share[decile] / SEEDS;
      if (measured.reach[decile] !== null) {
        reach[decile] += measured.reach[decile];
        seen[decile] += 1;
      }
    }
  }
  return {
    share,
    reach: reach.map((value, decile) => (seen[decile] > 0 ? value / seen[decile] : null)),
  };
}

const current = pooled(KIND);
const show = (values) =>
  `[${values.map((value) => (value === null ? "   - " : value.toFixed(3).padStart(5))).join(" ")}]`;

process.stdout.write("palm, pooled over generated forms against the authored measurement\n\n");
process.stdout.write(`  authored  share ${show(authored.share)}\n`);
process.stdout.write(`  candidate share ${show(current.share)}\n`);
process.stdout.write(`  authored  reach ${show(authored.reach)}\n`);
process.stdout.write(`  candidate reach ${show(current.reach)}\n\n`);
process.stdout.write(`  profile distance ${score(current).toFixed(4)}\n`);

/**
 * Coordinate descent over the form controls, one control at a time, repeated until no
 * single move improves the profile distance.
 *
 * A full grid over six controls is millions of generations; a coordinate pass is a few
 * thousand and finds the same basin when the controls are as loosely coupled as these.
 * It is a proxy search either way — whatever it lands on is judged on the gate.
 */
const AXIS_SETS = {
  palm: {
    crownSpan: [0, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95],
    whorls: [3, 4, 5, 6, 8],
    lengthScale: [0.5, 0.65, 0.8, 1, 1.2],
    widthScale: [0.7, 1, 1.4, 1.8],
    trunkBase: [0.055, 0.09, 0.13, 0.18],
    trunkHeight: [0.45, 0.55, 0.62, 0.72, 0.82],
  },
  // `clusters` is capped at its shipped 10. Triangle headroom is down to 0.132581 and
  // more lobes is the one control here that spends it; a fit is not worth buying with
  // the last of a budget the whole island shares.
  blossom: {
    trunkFraction: [0.12, 0.18, 0.24, 0.3, 0.38],
    clusters: [8, 9, 10],
    spread: [0.3, 0.38, 0.44, 0.52, 0.6],
    baseRadius: [0.07, 0.11, 0.16, 0.22],
    crownLow: [0, 0.12, 0.22, 0.32, 0.45],
  },
  bamboo: {
    canopyFloor: [0.6, 0.68, 0.74, 0.8, 0.85],
    lengthScale: [0.6, 0.8, 1, 1.2],
    droop: [0.02, 0.06, 0.1, 0.14, 0.2],
    riseLow: [0.15, 0.25, 0.35, 0.5, 0.65],
    radiusScale: [0.34, 0.4, 0.46, 0.54],
  },
};
const AXES = AXIS_SETS[KIND];

let best = { ...PALM_START };
let bestScore = score(pooled(KIND, best));
process.stdout.write(`  search start ${bestScore.toFixed(4)}
`);
for (let pass = 0; pass < 3; pass += 1) {
  let moved = false;
  for (const [control, values] of Object.entries(AXES)) {
    for (const value of values) {
      if (best[control] === value) continue;
      const trial = { ...best, [control]: value };
      if (!feasible(trial)) continue;
      const trialScore = score(pooled(KIND, trial));
      if (trialScore < bestScore - 1e-6) {
        best = trial;
        bestScore = trialScore;
        moved = true;
      }
    }
  }
  process.stdout.write(`  pass ${pass + 1}: ${bestScore.toFixed(4)}
`);
  if (!moved) break;
}

const fitted = pooled(KIND, best);
process.stdout.write(`
  fitted   share ${show(fitted.share)}
`);
process.stdout.write(`  fitted   reach ${show(fitted.reach)}
`);
process.stdout.write(`
  profile distance ${bestScore.toFixed(4)} from ${score(current).toFixed(4)}
`);
process.stdout.write(`  ${JSON.stringify(best)}
`);
process.stdout.write(`  ${triangleCount(best)} triangles, minimum ${CANOPY_MINIMUM[KIND] ?? "none"}
`);
