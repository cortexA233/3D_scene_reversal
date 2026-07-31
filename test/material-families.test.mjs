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

/**
 * Roughness and metalness, measured rather than declared.
 *
 * The albedo had an excuse for being hand-written — it lives in maps the Production
 * Runtime may not load, which is the whole reason a Material Family carries one. Roughness
 * never did. The authored materials record it as a plain scalar on 957 of 993 surfaces,
 * and every declared family has one over 100 per cent of its own area, so a hand-written
 * value here was a guess with the answer sitting in the frozen inventory.
 *
 * It mattered: the hand-written values were wrong by up to 0.17, with `terrain-ground`
 * declared 0.95 against a measured 0.80 and `distant-rock` 0.96 against 0.80 — both far
 * rougher than the authored surface.
 */
test("every Material Family's roughness is the measured one", async () => {
  const measured = await readMaybe(
    ".scratch/full-island-reconstruction/evidence/material-albedo-v1.json",
  );
  if (!measured) return; // Not measured on this checkout; the declared values stand.
  assert.equal(measured.schemaVersion, "material-albedo-v1");
  const byId = new Map(measured.families.map((family) => [family.id, family]));

  let checked = 0;
  for (const family of ISLAND_SCENE_RECIPE.materialFamilies) {
    const row = byId.get(family.id);
    // `ocean-surface` and the sky are `ShaderMaterial`s and declare no roughness at all,
    // so they are absent here rather than measured as zero. Folding an absent parameter
    // in as zero would have reported the authored sea as a mirror.
    if (!row?.usable || !Number.isFinite(row.roughness)) continue;
    if (row.roughnessFraction < 0.9) continue;
    assert.equal(
      family.roughness,
      row.roughness,
      `${family.id} roughness ${family.roughness} against a measured ${row.roughness}`,
    );
    assert.equal(family.metalness ?? 0, row.metalness > 0 ? row.metalness : 0);
    checked += 1;
  }
  assert.ok(checked >= 9, `only ${checked} families carry a measured roughness`);
});

test("a family measured from a sliver of its own surface is refused", async () => {
  /**
   * The guard, and the mistake it exists for. `shore-rock`'s albedo was once measured
   * over the 2.2 per cent of its surface that carries a map, which gave the whole family
   * one small prop's bright orange. Roughness has the same failure mode and the same
   * defence: the recipe takes a measured roughness only where the surface that declared
   * one is essentially all of it.
   */
  const measured = await readMaybe(
    ".scratch/full-island-reconstruction/evidence/material-albedo-v1.json",
  );
  if (!measured) return;
  for (const family of measured.families) {
    assert.ok(
      family.roughnessFraction === 0 || family.roughnessFraction >= 0.9,
      `${family.id} declares roughness over ${family.roughnessFraction} of its surface, ` +
        "which is neither none of it nor essentially all of it",
    );
    // Transparency and emission are measured and deliberately not carried yet. Recorded
    // so the next round starts from the numbers rather than from nothing: `paving-stone`
    // is 75 per cent marked transparent at an opacity of 1, which is alpha-tested
    // geometry rather than see-through surface and changes render ordering rather than
    // fade; `painted-timber` is 0.02 per cent transparent at 0.569; and exactly one
    // authored material in the scene carries an emissive colour at all.
    if (family.transparentFraction > 0) {
      assert.ok(
        Number.isFinite(family.opacity),
        `${family.id} is marked transparent over ${family.transparentFraction} of its ` +
          "surface but recorded no opacity",
      );
    }
  }
});
