import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relative) =>
  readFile(path.join(PROJECT_ROOT, relative), "utf8").then(JSON.parse);
const readMaybe = async (relative) => {
  try {
    return await readJson(relative);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

const EVIDENCE = ".scratch/scene-parity-foundation/evidence";
const [baseline, passes, fitted] = await Promise.all([
  readJson("tools/acceptance/baselines/scene-quality-baseline-v1.json"),
  readJson(`${EVIDENCE}/scene-passes-v1.json`),
  readMaybe("tools/reconstruction/fitted/material-family-v1.json"),
]);

const read = (dotted) =>
  dotted
    .replace(/^passes\./, "")
    .split(".")
    .reduce((value, key) => (value == null ? value : value[key]), passes);

/**
 * The four frozen appearance gates, read from the baseline rather than restated.
 *
 * Marked outstanding. ADR-0040's ordering rule means the native-appearance layer is
 * not even evaluated until both geometry layers pass, so this cannot be cleared by
 * appearance work alone — and the two geometry layers are held by recorded
 * boundaries of their own, ADR-0052 for the skyline and ADR-0054 for the terrain
 * landform budget. What this check is for is the ratchet: appearance work has to move
 * these numbers down and be seen to, rather than being declared done on a per-family
 * average the way ticket 08 was.
 */
const BLOCKED_BEHIND_GEOMETRY = {
  todo:
    "ADR-0040 does not evaluate native appearance until both geometry layers pass, and both are " +
    "held by recorded boundaries (ADR-0052, ADR-0054); this ratchets the appearance residual " +
    "rather than gating it",
};

test("appearance is inside its calibrated thresholds", BLOCKED_BEHIND_GEOMETRY, () => {
  const gates = baseline.layers.nativeAppearance;
  assert.equal(gates.length, 4, "the four appearance gates are not all declared");

  const failures = [];
  for (const gate of gates) {
    const value = read(gate.path);
    assert.ok(Number.isFinite(value), `${gate.name} is not measured at ${gate.path}`);
    const passed =
      gate.direction === "atMost" ? value <= gate.threshold : value >= gate.threshold;
    if (!passed) {
      failures.push(`${gate.name}: ${value} is not <= ${gate.threshold}`);
    }
  }
  assert.deepEqual(
    failures,
    [],
    `appearance is outside its calibrated thresholds:\n- ${failures.join("\n- ")}`,
  );
});

/**
 * Every family is measured somewhere, and the worst one is named.
 *
 * A family with no pixels on any camera is a family whose appearance nothing checks,
 * which is how `bamboo` went a whole ticket without being mentioned. This asserts the
 * evidence exists before anything is concluded from its average.
 */
test("every declared Material Family is measured on at least one camera", () => {
  const measured = new Set();
  for (const view of passes.views) {
    for (const family of Object.keys(view.appearance?.materialFamilies ?? {})) {
      measured.add(family);
    }
  }
  const declared = ISLAND_SCENE_RECIPE.materialFamilies.map((family) => family.id);
  const unmeasured = declared.filter((id) => !measured.has(id));
  assert.deepEqual(
    unmeasured,
    [],
    `these families have no appearance evidence on any camera: ${unmeasured.join(", ")}`,
  );
});

/**
 * The fit's own discipline, asserted rather than trusted.
 *
 * A per-family albedo is three numbers, and that is the whole licence under which
 * fitting appearance through a rendered capture is permitted. A fit that reached for
 * a per-entity or per-camera term, or that drove an albedo outside a reflectance,
 * would be compensating for geometry with colour — which the milestone forbids and
 * which the gate stack's ordering rule exists to prevent.
 */
test("the material fit stays a compact per-family correction", () => {
  if (!fitted) return; // Not yet fitted on this checkout; the declared albedos stand.
  assert.equal(fitted.schemaVersion, "material-family-fit-v1");
  const declared = new Set(ISLAND_SCENE_RECIPE.materialFamilies.map((family) => family.id));
  for (const [id, entry] of Object.entries(fitted.values)) {
    assert.ok(declared.has(id), `${id} is not a declared Material Family`);
    assert.equal(entry.albedo.length, 3, `${id} carries ${entry.albedo.length} albedo terms`);
    for (const channel of entry.albedo) {
      assert.ok(
        Number.isFinite(channel) && channel > 0 && channel < 1,
        `${id} has an albedo channel of ${channel}, which is not a reflectance`,
      );
    }
    // No per-entity, per-camera, or per-pixel term may appear beside it.
    assert.deepEqual(
      Object.keys(entry).sort(),
      ["albedo", "measuredDeltaE"],
      `${id} carries more than a per-family albedo`,
    );
  }
  const serialised = JSON.stringify(fitted);
  assert.ok(serialised.length < 8_000, `the material fit is ${serialised.length} bytes`);
});

/**
 * The recipe carries what the fit produced, so a clean generation reproduces it
 * without the fitter. A correction that lived only in the fitting tool would be an
 * evaluation-only fix, which the spec rejects.
 */
test("the Scene Recipe carries the fitted albedos", () => {
  if (!fitted) return;
  const declared = new Map(
    ISLAND_SCENE_RECIPE.materialFamilies.map((family) => [family.id, family]),
  );
  const drifted = [];
  for (const [id, entry] of Object.entries(fitted.values)) {
    const family = declared.get(id);
    if (JSON.stringify(family.albedo) !== JSON.stringify(entry.albedo)) {
      drifted.push(
        `${id}: recipe ${JSON.stringify(family.albedo)} against fit ${JSON.stringify(entry.albedo)}`,
      );
    }
  }
  assert.deepEqual(
    drifted,
    [],
    `the recipe was not rebuilt after the fit:\n- ${drifted.join("\n- ")}`,
  );
});
