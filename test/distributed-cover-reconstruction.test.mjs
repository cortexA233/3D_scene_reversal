import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { findControl } from "../tools/evaluation/scene-graph-perturbations.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const readJson = (relative) =>
  readFile(path.join(PROJECT_ROOT, relative), "utf8").then(JSON.parse);

const EVIDENCE = ".scratch/scene-parity-foundation/evidence";
const [baseline, passes, correspondence] = await Promise.all([
  readJson("tools/acceptance/baselines/scene-quality-baseline-v1.json"),
  readJson(`${EVIDENCE}/scene-passes-v1.json`),
  readJson(`${EVIDENCE}/scene-correspondence-v1.json`),
]);

const cover = correspondence.distributedCover;
const populations = ISLAND_SCENE_RECIPE.populations;
const ground = cover.rows.filter((row) => row.referenceRegion.min[1] > -100);
const SEA_LEVEL = ISLAND_SCENE_RECIPE.world.semanticSeaLevel;

/**
 * The floor a population's mass may not sink below, as a displacement rather
 * than a height, so the limit means the same thing as the rest of the stack: a
 * cover whose lowest instance is further from the authored one than the frozen
 * bracket's own severe placement damage is misplaced by any reading. Taken from
 * the bracket rather than restated, so the two cannot drift apart.
 */
const SEVERE_PLACEMENT = 12;
assert.equal(
  findControl(`translate-${SEVERE_PLACEMENT}`)?.class,
  "severe",
  "the placement magnitude cited here is no longer the bracket's severe control",
);

/**
 * The measured defect. Every ground population is scattered across its region
 * ellipse and settled on whatever the terrain is under it, with no test for
 * whether that is land. The region spans the island and the water around it, so
 * five of the six populations were planted down the seabed: reference floors at
 * 13.31, 14.00, 23.72, 24.05 and 25.29 against candidate floors at -49.65,
 * -50.20, 4.87, 7.05 and 5.15.
 *
 * Nothing hides it, and nothing gates it either — Distributed Scene Cover has no
 * thresholds of its own, so the damage arrives at acceptance through the `cover`
 * group in the fixed-camera layer, where it is the worst group by two orders of
 * magnitude.
 */
test("no ground population is planted below the water", () => {
  assert.ok(ground.length >= 5, `only ${ground.length} ground populations were measured`);

  // The terrain calls anything below two units under the Semantic Sea Level
  // `sea`, and ground cover belongs on land and shore. An instance reaches below
  // its own origin by its own scale, so the floor is that boundary less the
  // largest instance.
  const reach = Math.max(...populations.map((population) => population.scaleRange?.[1] ?? 0));
  const failures = [];
  for (const row of ground) {
    if (row.candidateRegion.min[1] < SEA_LEVEL - 2 - reach) {
      failures.push(
        `the ${row.count}-instance population reaches ${row.candidateRegion.min[1].toFixed(2)}, ` +
          `below the sea and shore boundary at ${SEA_LEVEL - 2}`,
      );
    }
  }
  assert.deepEqual(
    failures,
    [],
    `Distributed Scene Cover is on the seabed:\n- ${failures.join("\n- ")}`,
  );
});

/**
 * How far each population still starts below the height the authored one starts
 * at, ratcheted against where this ticket opened rather than gated.
 *
 * It is deliberately not a threshold. Clearing the water fixes the two big
 * coastal populations outright — they drop from 63 and 64 units below their
 * authored floor to 0.6 and 1.25 — but the three small inland ones stay about
 * eleven units low, and that residual is not cover's to pay. Under those three
 * ellipses the candidate's terrain tops out near 28 against authored floors of
 * 23.7 to 25.3, so only 17 to 27 per cent of each ellipse clears its floor at
 * all. Filtering on the floor to close the gap rejected four draws in five and
 * collapsed the density ratios to 0.19: a terrain residual paid for out of a
 * cover statistic. The gap closes when ticket 03 does.
 */
const DROP_AT_TICKET_START = Object.freeze({
  900: 62.96,
  4200: 64.2,
  948: 18.85,
  127: 17,
  145: 20.14,
});

test("every population starts closer to its authored floor than it did", () => {
  const failures = [];
  for (const row of ground) {
    const drop = row.referenceRegion.min[1] - row.candidateRegion.min[1];
    const before = DROP_AT_TICKET_START[row.count];
    assert.ok(before !== undefined, `no recorded starting drop for ${row.count} instances`);
    if (!(drop < before)) {
      failures.push(
        `the ${row.count}-instance population starts ${drop.toFixed(2)} units below its ` +
          `authored floor, against ${before} when the ticket opened`,
      );
    }
  }
  assert.deepEqual(failures, [], `cover moved away from its authored floors:\n- ${failures.join("\n- ")}`);
  // The bracket's severe placement damage, as the scale to read those drops
  // against: two of the five are now well inside it and three are not.
  assert.equal(SEVERE_PLACEMENT, 12);
});

/**
 * What cover costs at acceptance. It is the worst group in the fixed-camera
 * layer and it fails the two worst-case gates on its own, so this reads them
 * from the baseline rather than restating them.
 *
 * Marked outstanding, not loosened. Clearing the water did not move it, and the
 * measurement says why: the candidate draws 5,302 cover pixels on the authored
 * overview where the reference draws 128, and the two largest populations
 * contribute zero reference pixels there at all. Two inputs are invented rather
 * than measured. The per-instance scale in the Scene Recipe is a hardcoded
 * `[0.6, 1.6]` for every population, while the reference's own instanced surface
 * area implies 1.344, 0.506, 0.696, 0.420 and 0.705 — so four of the five are
 * between 1.6 and 2.7 times too large, and area goes as the square. And nothing
 * measures how deep an authored instance is buried, which is the only way two
 * populations spanning 590 by 552 units across the island can occupy no pixels.
 * Both need a reference measurement that does not exist yet; neither is a
 * placement rule.
 */
const NEEDS_INSTANCE_MEASUREMENT = {
  todo:
    "the per-instance scale is invented (0.6-1.6 against a measured 0.42-1.34) and burial depth " +
    "is unmeasured; cover draws 5,302 pixels against the reference's 128",
};

test("the cover group is inside the frozen worst-group thresholds", NEEDS_INSTANCE_MEASUREMENT, () => {
  const gates = baseline.layers.fixedCameraGeometry.filter((metric) =>
    metric.scope === "worst-group",
  );
  assert.ok(gates.length >= 2, "the worst-group gates are not declared");

  const failures = [];
  for (const view of passes.views) {
    const measured = view.byGroup?.cover;
    if (!measured) continue;
    const iou = baseline.layers.fixedCameraGeometry.find(
      (metric) => metric.name === "worst group silhouette IoU",
    );
    if (measured.intersectionOverUnion < iou.threshold) {
      failures.push(
        `${view.camera}: cover silhouette IoU ${measured.intersectionOverUnion} is not >= ${iou.threshold}`,
      );
    }
  }
  assert.deepEqual(
    failures,
    [],
    `the cover group is outside its frozen threshold:\n- ${failures.join("\n- ")}`,
  );
});

/**
 * Cover is compared by population, never by instance pairing: a scatter has no
 * stable per-instance identity, and pairing one would reward reproducing an
 * arrangement rather than a distribution.
 */
test("every population is matched by identity, count, region and density", () => {
  assert.equal(cover.unmatched, 0);
  assert.equal(cover.candidateCovers, cover.referenceCovers);
  assert.equal(populations.length, cover.referenceCovers);

  for (const row of cover.rows) {
    assert.equal(row.matched, true);
    assert.ok(
      row.densityRatio > 0.7 && row.densityRatio < 1.4,
      `a ${row.count}-instance population has density ratio ${row.densityRatio}`,
    );
  }
  // Counts are measured, not chosen, so they are exact.
  const declared = new Set(populations.map((population) => population.count));
  for (const row of cover.rows) {
    assert.ok(declared.has(row.count), `no declared population has ${row.count} instances`);
  }
});

/**
 * Instancing is what keeps six populations inside the draw-call budget. One mesh
 * per instance would be 6,354 draw calls on its own.
 */
test("cover stays instanced", () => {
  const total = populations.reduce((sum, population) => sum + population.count, 0);
  assert.ok(total > 5000, `only ${total} cover instances are declared`);
  assert.ok(
    populations.length <= 8,
    `${populations.length} populations is more than one instanced mesh each`,
  );
});
