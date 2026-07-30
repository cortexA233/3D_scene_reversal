/**
 * Which way each Material Family's rendered appearance is wrong, and by how much.
 *
 * A per-family DeltaE says how far a family is from the authored one; it cannot say in
 * which direction, so on its own nothing could be concluded from it. This pools each
 * family's own reference and candidate channel means over the six frozen cameras,
 * weighted by pixels the way `appearanceByMaterialFamily` weights its aggregate, and
 * reports the ratio.
 *
 * It reports and does not write, deliberately.
 *
 * An earlier version of this tool corrected each family's albedo by that ratio, which
 * is the obvious fitting loop and the wrong one. The authored canopy renders dark
 * partly because it is dense and self-shadowing: a candidate with a sparser canopy
 * that matched the rendered mean by lowering its albedo would be standing material in
 * for missing geometry, which is exactly what ADR-0040's ordering rule — no appearance
 * evaluation until the geometry layers pass — exists to prevent. The albedo is measured
 * from the authored maps instead, by `measure-material-albedo.mjs`, and what this
 * reports afterwards is the residual that measurement did not explain. That residual is
 * geometry's, and reading it as a colour correction would hide it.
 *
 * So: use this to see whether an appearance change went the right way, and to see which
 * families are left over once their materials are measured. Do not use it to choose an
 * albedo.
 *
 *   node tools/development/measure-appearance-direction.mjs
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ISLAND_SCENE_RECIPE } from "../../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PASSES_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence/scene-passes-v1.json",
);

const argv = process.argv.slice(2);

/**
 * How far one iteration may move a family, and where it may end up.
 *
 * Damping is not timidity. The channel means are the *rendered* result, so the
 * relationship between an albedo and its mean is only locally linear: tone mapping
 * compresses the highlights, the grade mixes towards a tint, and a family that
 * shares pixels with fog moves less than its albedo does. A full correction
 * overshoots and oscillates. Half of it converges in three or four captures, and the
 * loop reports its own trajectory so a stalled fit is visible rather than assumed.
 *
 * The clamp is what keeps this a Material Family rather than a per-camera fudge: an
 * albedo outside zero to one is not a reflectance, and a family that wants to leave
 * that range is telling you something about the geometry or the lighting instead.
 */
const DAMPING = 0.5;
const ALBEDO_FLOOR = 0.02;
const ALBEDO_CEILING = 0.98;
/** Below this, a family is already inside the noise of a single capture. */
const CONVERGED_RATIO = 0.02;

/**
 * Each family's rendered means, pooled over every camera that measured it.
 *
 * Pooled by pixel count rather than averaged over cameras: a family that fills the
 * authored overview and three pixels of an oblique should be corrected by what the
 * overview says. This is the same weighting `appearanceByMaterialFamily` uses for its
 * own aggregate.
 */
function pooledMeans(passes) {
  const pooled = new Map();
  for (const view of passes.views) {
    for (const [family, row] of Object.entries(view.appearance?.materialFamilies ?? {})) {
      if (!row?.referenceChannelMeans || !row?.candidateChannelMeans) continue;
      const entry =
        pooled.get(family) ??
        { count: 0, reference: [0, 0, 0], candidate: [0, 0, 0], deltaE: 0 };
      entry.count += row.count;
      entry.deltaE += row.mean * row.count;
      for (let channel = 0; channel < 3; channel += 1) {
        entry.reference[channel] += row.referenceChannelMeans[channel] * row.count;
        entry.candidate[channel] += row.candidateChannelMeans[channel] * row.count;
      }
      pooled.set(family, entry);
    }
  }
  const result = new Map();
  for (const [family, entry] of pooled) {
    if (entry.count === 0) continue;
    result.set(family, {
      pixels: entry.count,
      deltaE: entry.deltaE / entry.count,
      reference: entry.reference.map((sum) => sum / entry.count),
      candidate: entry.candidate.map((sum) => sum / entry.count),
    });
  }
  return result;
}

const passes = JSON.parse(await readFile(PASSES_PATH, "utf8"));
const measured = pooledMeans(passes);
assert.ok(
  measured.size > 0,
  "the capture carries no per-family channel means; re-run scripts/run-scene-passes.mjs",
);

const fitted = { iterations: 0, values: {}, history: [] };

const declared = new Map(
  ISLAND_SCENE_RECIPE.materialFamilies.map((family) => [family.id, family]),
);

const rows = [];
for (const [id, family] of declared) {
  const row = measured.get(id);
  if (!row) {
    rows.push({ id, skipped: "no pixels in this capture" });
    continue;
  }
  // The correction, per channel. A ratio above one means the reference is brighter
  // than the candidate in that channel, so the albedo rises.
  const ratio = row.reference.map(
    (reference, channel) => reference / Math.max(1, row.candidate[channel]),
  );
  const current = fitted.values[id]?.albedo ?? family.albedo;
  const next = current.map((value, channel) => {
    const corrected = value * (1 + (ratio[channel] - 1) * DAMPING);
    return Number(Math.min(ALBEDO_CEILING, Math.max(ALBEDO_FLOOR, corrected)).toFixed(4));
  });
  const worstRatio = Math.max(...ratio.map((value) => Math.abs(value - 1)));
  rows.push({
    id,
    pixels: row.pixels,
    deltaE: row.deltaE,
    ratio,
    current,
    next,
    converged: worstRatio < CONVERGED_RATIO,
    clamped: next.some((value) => value === ALBEDO_FLOOR || value === ALBEDO_CEILING),
  });
}

rows.sort((a, b) => (b.deltaE ?? -1) - (a.deltaE ?? -1));
process.stdout.write(
  "per-family rendered appearance, pooled over the six frozen cameras\n" +
    "the albedo column is what the recipe carries; this tool never changes it\n\n" +
    "family".padEnd(18) +
    "DeltaE".padStart(8) +
    "  ref RGB".padEnd(22) +
    "cand RGB".padEnd(22) +
    "albedo now -> next\n",
);
const rgb = (values) => `[${values.map((value) => value.toFixed(0).padStart(3)).join(" ")}]`;
const albedo = (values) => `[${values.map((value) => value.toFixed(2)).join(" ")}]`;
for (const row of rows) {
  if (row.skipped) {
    process.stdout.write(`${row.id.padEnd(18)}  ${row.skipped}\n`);
    continue;
  }
  const means = measured.get(row.id);
  process.stdout.write(
    row.id.padEnd(18) +
      row.deltaE.toFixed(2).padStart(8) +
      "  " +
      rgb(means.reference).padEnd(22) +
      rgb(means.candidate).padEnd(22) +
      `${albedo(row.current)} -> ${albedo(row.next)}` +
      (row.converged ? "  converged" : "") +
      (row.clamped ? "  CLAMPED" : "") +
      "\n",
  );
}

const measurable = rows.filter((row) => !row.skipped);
const worst = measurable.reduce(
  (best, row) => (!best || row.deltaE > best.deltaE ? row : best),
  null,
);
const withinNoise = measurable.filter((row) => row.converged).length;
process.stdout.write(
  `\n${withinNoise} of ${measurable.length} families are within a capture's own noise of the ` +
    `reference; worst is ${worst.id} at DeltaE ${worst.deltaE.toFixed(2)}\n` +
    "a ratio far from 1 after the albedo has been measured is geometry, not colour\n",
);
