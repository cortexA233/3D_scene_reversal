/**
 * What the mountains' flank exponent costs the surface gate, and what moving it would buy.
 *
 * The sixteen horizon groups are already fitted, but `tools/reconstruction/fit-horizon-ridge.mjs`
 * fits them to the **skyline**: elevation-angle p95 and max, a depth term, and coverage.
 * Surface distance is not in that objective anywhere. It is also 37 per cent of the whole
 * island's surface residual, and pooled over the sixteen the candidate carries 23.9 per
 * cent of its area above the fifth decile against an authored 14.0 — too much mass high,
 * which is what a flank that does not fall away looks like.
 *
 * The flank is `height * (1 - spanned^2) ** falloff`. At the 0.5 the generator defaults to
 * that is a circular section, convex and full near the crest; raising the exponent pulls
 * the section in and moves mass down. This sweeps a multiplier on every group's own fitted
 * value and reports, per multiplier, both things that matter: the surface distance the
 * gate reads, and the skyline score the existing fit was built to minimise.
 *
 * Nothing is written. The point is to find out whether the two objectives conflict before
 * spending anything on a fit that might not be allowed to land.
 *
 *   node tools/development/measure-mountain-flank.mjs
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
const readEvidence = (name) => readFile(path.join(EVIDENCE, name), "utf8").then(JSON.parse);

const [inventory, samples] = await Promise.all([
  readEvidence("scene-inventory-v1.json"),
  readEvidence("scene-surface-samples-v1.json"),
]);
const reference = observeAuthoredReference({ inventory, samples });
const TOLERANCE = 1;

const DEFAULTS = {
  flankFalloff: 0.5,
  spreadScale: 1,
  ridgeApron: 0,
  ridgeElongation: 1,
  saddleDepth: 0,
};

/** The recipe with one mountain control scaled on every group, and nothing else touched. */
function recipeWith(control, multiplier) {
  return {
    ...ISLAND_SCENE_RECIPE,
    entities: ISLAND_SCENE_RECIPE.entities.map((entity) => {
      if (entity.kind !== "mountain") return entity;
      const value = entity.shape?.[control] ?? DEFAULTS[control];
      return { ...entity, shape: { ...entity.shape, [control]: value * multiplier } };
    }),
  };
}

function mountainSurface(control, multiplier) {
  const { semanticIndex } = generateScene(recipeWith(control, multiplier));
  const rows = [];
  for (const entity of ISLAND_SCENE_RECIPE.entities) {
    if (entity.kind !== "mountain") continue;
    const left = reference.entities.get(entity.semanticId);
    const node = semanticIndex.get(entity.semanticId);
    if (!left || !node) continue;
    const holder = node.object ?? node.node ?? node;
    const measured = surfaceDistance(left.samples, sampleEntitySurface(holder), TOLERANCE);
    if (measured) rows.push({ semanticId: entity.semanticId, p95: measured.symmetric.p95 });
  }
  const mean = rows.reduce((sum, row) => sum + row.p95, 0) / rows.length;
  const worst = rows.reduce((worst, row) => (row.p95 > worst.p95 ? row : worst), rows[0]);
  return { mean, worst, rows };
}

/**
 * Every continuous group control, swept over the same wide multiplier range.
 *
 * One control at a time is a weak search and is meant to be: the question is not what the
 * best combination is, it is whether *any* of these controls has the authority to move a
 * residual of about 102 world units toward a 14.037975 threshold. A control that cannot
 * move it by more than a couple of per cent over a twelvefold range is not the reason the
 * gate is red, and knowing that is worth more than a marginal fit.
 */
const CONTROLS = ["flankFalloff", "spreadScale", "ridgeApron", "ridgeElongation", "saddleDepth"];
const MULTIPLIERS = [0.5, 0.75, 1, 1.5, 2, 3, 6];

process.stdout.write("mountain control sweep, sixteen groups, mean surface p95\n\n");
process.stdout.write(
  `  ${"control".padEnd(17)}${MULTIPLIERS.map((m) => `x${m}`.padStart(9)).join("")}   best\n`,
);
for (const control of CONTROLS) {
  const row = MULTIPLIERS.map((multiplier) => mountainSurface(control, multiplier).mean);
  const best = Math.min(...row);
  const shipped = row[MULTIPLIERS.indexOf(1)];
  process.stdout.write(
    `  ${control.padEnd(17)}${row.map((v) => v.toFixed(3).padStart(9)).join("")}   ` +
      `${(((shipped - best) / shipped) * 100).toFixed(2)}% better at x${MULTIPLIERS[row.indexOf(best)]}\n`,
  );
}
const shippedRow = mountainSurface("flankFalloff", 1);
process.stdout.write(
  `\n  shipped mean ${shippedRow.mean.toFixed(4)}, worst entity ${shippedRow.worst.p95.toFixed(4)}, ` +
    `threshold 14.037975\n`,
);
