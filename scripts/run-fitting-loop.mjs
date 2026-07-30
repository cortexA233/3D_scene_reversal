/**
 * Prove the Reference-guided Fitting Loop.
 *
 * One complete, controlled iteration on one narrow tracer:
 *
 *   1. read the immutable reference skyline through read-only access
 *   2. measure the candidate's discrepancy with the metric acceptance uses
 *   3. persist a compact correction into the Scene Recipe
 *   4. regenerate through the real production path
 *   5. prove the intended metric improved and nothing else moved
 *
 * The correction is one number per Horizon Group. It is written into the Scene
 * Recipe, never into the Candidate Adapter or an acceptance artifact, and it is
 * reproduced from a clean generation before it can affect any report.
 *
 *   node scripts/run-fitting-loop.mjs           # fit and record
 *   node scripts/run-fitting-loop.mjs --check   # verify the recorded iteration
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { measureHorizon } from "./run-horizon-evidence.mjs";
import { fitHorizonSpread } from "../tools/reconstruction/fit-horizon-spread.mjs";
import { generateScene } from "../gt_designer/src/reconstruction/scene/scene-generator.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const EVIDENCE_DIRECTORY = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence",
);
const HISTORY_PATH = path.join(EVIDENCE_DIRECTORY, "fitting-history-v1.json");
const RECIPE_PATH = path.join(
  PROJECT_ROOT,
  "gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js",
);
const FIT_PATH = path.join(
  PROJECT_ROOT,
  "tools/reconstruction/fitted/horizon-spread-v1.json",
);
const checkOnly = process.argv.includes("--check");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** Deterministic CPU-geometry signature for one generated entity. */
export function geometrySignature(object) {
  object.updateMatrixWorld(true);
  const hash = createHash("sha256");
  object.traverse((child) => {
    if (!child.isMesh) return;
    hash.update(child.userData.semanticPart ?? "");
    hash.update(new Float32Array(child.matrixWorld.elements));
    hash.update(child.geometry.attributes.position.array);
  });
  return hash.digest("hex");
}

/**
 * Reads the Scene Recipe from disk as a clean production run would. Node caches
 * modules by specifier, and busting only the importer would still serve the
 * cached recipe to everything it depends on, so the recipe is loaded explicitly
 * and passed down rather than resolved through the cache.
 */
async function loadRecipe() {
  const { ISLAND_SCENE_RECIPE } = await import(
    `../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js?v=${Date.now()}`
  );
  return ISLAND_SCENE_RECIPE;
}

/** Regenerates the Scene Recipe through the real production build path. */
async function rebuildRecipe() {
  const { spawnSync } = await import("node:child_process");
  const rebuild = spawnSync(
    process.execPath,
    [path.join(PROJECT_ROOT, "tools/reconstruction/build-scene-recipe.mjs")],
    { cwd: PROJECT_ROOT, encoding: "utf8" },
  );
  assert.equal(rebuild.status, 0, `recipe rebuild failed:
${rebuild.stderr}`);
}

async function main() {
  const referenceBefore = await readFile(
    path.join(EVIDENCE_DIRECTORY, "horizon-reference-v1.json"),
    "utf8",
  );
  const baselineBefore = await readFile(
    path.join(PROJECT_ROOT, "tools/acceptance/baselines/scene-quality-baseline-v1.json"),
    "utf8",
  );

  // ── 0. Start from the declared unfitted state ────────────────────────────
  // The loop is idempotent, so re-fitting an already-fitted recipe proves
  // nothing. Resetting the control to its neutral value first is what makes
  // this a demonstration rather than a no-op.
  await mkdir(path.dirname(FIT_PATH), { recursive: true });
  const neutral = {
    schemaVersion: "horizon-spread-fit-v1",
    control: "spreadScale",
    range: { minimum: 0.3, maximum: 1.6, step: 0.05 },
    values: {},
  };
  await writeFile(FIT_PATH, `${JSON.stringify(neutral, null, 2)}
`);
  await rebuildRecipe();

  // ── 1. Measure the discrepancy with the acceptance metric ────────────────
  const recipe = await loadRecipe();
  const before = await measureHorizon({ recipe });
  const generatedBefore = generateScene(recipe);
  const unrelated = recipe.entities
    .filter((entity) => entity.group !== "horizon")
    .slice(0, 60)
    .map((entity) => ({
      semanticId: entity.semanticId,
      signature: geometrySignature(generatedBefore.semanticIndex.get(entity.semanticId).object),
      seeds: generatedBefore.semanticIndex.get(entity.semanticId).seeds,
    }));

  // ── 2. Fit one compact control per Horizon Group ─────────────────────────
  const fitted = fitHorizonSpread({
    THREE,
    recipe,
    referenceGroups: before.referenceGroups,
    anchor: recipe.sceneAnchor,
    bins: 720,
  });
  assert.ok(fitted.length > 0, "the tracer fitted nothing");

  const fittedRecord = {
    schemaVersion: "horizon-spread-fit-v1",
    control: "spreadScale",
    range: { minimum: 0.3, maximum: 1.6, step: 0.05 },
    values: Object.fromEntries(fitted.map((row) => [row.semanticId, row.spreadScale])),
  };
  const fittedSerialized = `${JSON.stringify(fittedRecord, null, 2)}\n`;
  if (!checkOnly) {
    await mkdir(path.dirname(FIT_PATH), { recursive: true });
    await writeFile(FIT_PATH, fittedSerialized);
  } else {
    assert.equal(await readFile(FIT_PATH, "utf8"), fittedSerialized, "the fitted control drifted");
  }

  // ── 3 and 4. Persist into the Recipe and regenerate through production ───
  process.stdout.write("Fitting loop: rebuilding the Scene Recipe with the persisted control\n");
  const { spawnSync } = await import("node:child_process");
  const rebuild = spawnSync(
    process.execPath,
    [path.join(PROJECT_ROOT, "tools/reconstruction/build-scene-recipe.mjs")],
    { cwd: PROJECT_ROOT, encoding: "utf8" },
  );
  assert.equal(rebuild.status, 0, `recipe rebuild failed:\n${rebuild.stderr}`);

  // ── 5. Re-measure from a clean generation ────────────────────────────────
  const rebuiltRecipe = await loadRecipe();
  const after = await measureHorizon({ recipe: rebuiltRecipe });
  const generatedAfter = generateScene(rebuiltRecipe);

  // The tracer's control governs how broadly one group's summits sit inside its
  // own footprint, so the metric it must move is that group's silhouette. The
  // combined 360-degree profile is a max across overlapping groups and is
  // dominated by inter-group occlusion, which this control does not own.
  const improvement = {
    metric: "horizon.groups.silhouetteError.mean",
    before: before.report.groups.silhouetteError.mean,
    after: after.report.groups.silhouetteError.mean,
    combinedProfileP95: {
      before: before.report.profile.angularError.p95,
      after: after.report.profile.angularError.p95,
      note: "reported for context; the tracer does not target it",
    },
  };
  assert.ok(
    improvement.after < improvement.before,
    `the persisted correction did not improve the target metric: ${improvement.before} -> ${improvement.after}`,
  );

  // The reference and the frozen thresholds are untouched.
  assert.equal(
    sha256(
      await readFile(path.join(EVIDENCE_DIRECTORY, "horizon-reference-v1.json"), "utf8"),
    ),
    sha256(referenceBefore),
    "the reference evidence changed during fitting",
  );
  assert.equal(
    sha256(
      await readFile(
        path.join(PROJECT_ROOT, "tools/acceptance/baselines/scene-quality-baseline-v1.json"),
        "utf8",
      ),
    ),
    sha256(baselineBefore),
    "the frozen baseline changed during fitting",
  );

  // Unrelated entities keep identical derived seeds and identical CPU geometry.
  const drifted = unrelated.filter((row) => {
    const record = generatedAfter.semanticIndex.get(row.semanticId);
    return (
      !record ||
      geometrySignature(record.object) !== row.signature ||
      JSON.stringify(record.seeds) !== JSON.stringify(row.seeds)
    );
  });
  assert.deepEqual(
    drifted.map((row) => row.semanticId),
    [],
    "fitting one Horizon Group perturbed unrelated entities",
  );

  const history = {
    schemaVersion: "fitting-history-v1",
    tracer: "Horizon Group summit spread",
    measuredDiscrepancy:
      "Generated Horizon Group summits were broader than the authored skyline, so the 360-degree Horizon Profile sat above the reference across most azimuths.",
    referenceEvidence: "horizon-reference-v1.json (read-only)",
    metric: improvement.metric,
    before: improvement.before,
    after: improvement.after,
    combinedProfileP95: improvement.combinedProfileP95,
    productionChange:
      "One compact spreadScale control per Horizon Group, persisted in the Scene Recipe and applied by the production Object Generator.",
    controlsAdded: fitted.length,
    numbersAdded: fitted.length,
    retainedReferenceData: "none: no mesh, sample array, or pixel is persisted",
    unrelatedEntitiesChecked: unrelated.length,
    unrelatedEntitiesDrifted: 0,
    perGroup: fitted,
  };
  const historySerialized = `${JSON.stringify(history, null, 2)}\n`;
  if (checkOnly) {
    assert.equal(await readFile(HISTORY_PATH, "utf8"), historySerialized, "fitting history drifted");
  } else {
    await writeFile(HISTORY_PATH, historySerialized);
  }

  process.stdout.write(
    `Fitting loop: ${improvement.metric} ${improvement.before} -> ${improvement.after} ` +
      `via ${fitted.length} persisted controls; ${unrelated.length} unrelated entities byte-identical\n`,
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
