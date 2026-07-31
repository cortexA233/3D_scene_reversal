/**
 * What an authored building's mass actually looks like, by height.
 *
 * Human Parity Review named the village as the largest remaining geometry residual,
 * and the measurements agree: `structures` carries the worst per-group depth p95 in
 * the fixed-camera layer at 117.19 against a threshold of 22.35, `bridges` draws 2.11
 * times the reference's pixels and `plazas` 1.89. None of those are terrain-blocked —
 * a building is 18.9 units thick against 7.1 units of terrain misfit beneath it — so
 * unlike the paving slabs they are the generator's own to fix.
 *
 * Before changing the generator, this measures the subject, because ticket 05 spent
 * two rounds fitting a guess before anyone read the authored mesh and the shape was
 * obvious once they did.
 *
 * Two profiles per kind, pooled over its placements and normalised into each
 * entity's own box so buildings of different sizes are comparable:
 *
 * - **occupancy by height decile**, which says where the mass is: a platform reads as
 *   a spike at the bottom, a tall body as a flat middle, a roof as a taper.
 * - **mean horizontal half-extent by height decile**, which says what the silhouette
 *   does: a pyramid narrows monotonically, and a flared eave *widens* before it
 *   narrows. That distinction is the whole difference between the candidate's cone
 *   roof and an authored one, and no single number can carry it.
 *
 * Both subjects are measured the same way from the same samples the surface gate
 * uses, so a difference here is a difference the gate sees.
 *
 *   node tools/development/measure-architecture-massing.mjs
 *   node tools/development/measure-architecture-massing.mjs --kinds shop-stall,pavilion
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ISLAND_SCENE_RECIPE } from "../../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { generateScene } from "../../gt_designer/src/reconstruction/scene/scene-generator.js";
import { observeAuthoredReference } from "../evaluation/scene-observation.mjs";
import { sampleEntitySurface } from "../evaluation/surface-sampling.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EVIDENCE = path.join(PROJECT_ROOT, ".scratch/scene-parity-foundation/evidence");
const readEvidence = (name) => readFile(path.join(EVIDENCE, name), "utf8").then(JSON.parse);

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

const DECILES = 10;

/**
 * One entity's mass profile in its own normalised box.
 *
 * `share` is the fraction of the entity's sampled geometry in each height decile.
 * `halfExtent` is the mean horizontal distance from the entity's own vertical axis,
 * as a fraction of half its footprint — so 1.0 means the mass reaches the edge of its
 * bounding box and a value that rises with height is a flare.
 */
function profile(points) {
  if (!points || points.length < 9) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < points.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = points[index + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  if (!(size[1] > 0)) return null;
  const centre = [(min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2];
  const half = [Math.max(1e-6, size[0] / 2), 0, Math.max(1e-6, size[2] / 2)];

  const counts = new Array(DECILES).fill(0);
  const reach = new Array(DECILES).fill(0);
  for (let index = 0; index < points.length; index += 3) {
    const level = Math.min(
      DECILES - 1,
      Math.floor(((points[index + 1] - min[1]) / size[1]) * DECILES),
    );
    counts[level] += 1;
    // Normalised by each axis's own half-size, so a long thin hall and a square
    // pavilion are compared on proportion rather than on absolute width.
    const u = (points[index] - centre[0]) / half[0];
    const w = (points[index + 2] - centre[2]) / half[2];
    reach[level] += Math.max(Math.abs(u), Math.abs(w));
  }
  const total = counts.reduce((sum, value) => sum + value, 0);
  return {
    share: counts.map((count) => count / total),
    halfExtent: counts.map((count, level) => (count > 0 ? reach[level] / count : null)),
    aspect: size[1] / Math.max(size[0], size[2]),
  };
}

function pool(profiles) {
  const kept = profiles.filter(Boolean);
  if (kept.length === 0) return null;
  const share = new Array(DECILES).fill(0);
  const halfExtent = new Array(DECILES).fill(0);
  const seen = new Array(DECILES).fill(0);
  for (const entry of kept) {
    for (let level = 0; level < DECILES; level += 1) {
      share[level] += entry.share[level];
      if (entry.halfExtent[level] !== null) {
        halfExtent[level] += entry.halfExtent[level];
        seen[level] += 1;
      }
    }
  }
  return {
    count: kept.length,
    aspect: kept.reduce((sum, entry) => sum + entry.aspect, 0) / kept.length,
    share: share.map((value) => value / kept.length),
    halfExtent: halfExtent.map((value, level) => (seen[level] > 0 ? value / seen[level] : null)),
  };
}

const requested = flag("--kinds")?.split(",").map((value) => value.trim());
// Without `--kinds` this reports the village, which is what it was written for.
// With it, any group is fair game — the profiles are normalised into each
// entity's own box, so nothing about them is village-specific, and a `--kinds`
// that silently matched nothing wasted a round of measurement once already.
const structures = requested
  ? ISLAND_SCENE_RECIPE.entities
  : ISLAND_SCENE_RECIPE.entities.filter((entity) =>
      ["structures", "bridges", "plazas"].includes(entity.group),
    );
const kinds = requested ?? [...new Set(structures.map((entity) => entity.kind))];
if (requested) {
  const unmatched = requested.filter(
    (kind) => !structures.some((entity) => entity.kind === kind),
  );
  if (unmatched.length > 0) {
    throw new Error(
      `no entities of kind ${unmatched.join(", ")}; known kinds: ` +
        [...new Set(ISLAND_SCENE_RECIPE.entities.map((entity) => entity.kind))].sort().join(", "),
    );
  }
}

const bar = (value) => "#".repeat(Math.max(0, Math.round(value * 40)));
/**
 * Evidence, so a test can assert against this comparison instead of recomputing it.
 * Both subjects go through one sampler here; a test that measured the generated form
 * its own way would report the difference between two methods as a shape error, which
 * is what ADR-0055 was written about and what the first version of the decoration test
 * did.
 */
const measured = [];
for (const kind of kinds) {
  const entities = structures.filter((entity) => entity.kind === kind);
  if (entities.length === 0) continue;
  const referenceProfiles = [];
  const candidateProfiles = [];
  for (const entity of entities) {
    const observed = reference.entities.get(entity.semanticId);
    const node = semanticIndex.get(entity.semanticId);
    referenceProfiles.push(profile(observed?.samples));
    if (node) {
      const holder = node.object ?? node.node ?? node;
      candidateProfiles.push(profile(sampleEntitySurface(holder)));
    }
  }
  const left = pool(referenceProfiles);
  const right = pool(candidateProfiles);
  if (!left || !right) continue;
  const round = (value) => (value === null ? null : Number(value.toFixed(4)));
  measured.push({
    kind,
    placements: entities.length,
    authored: {
      aspect: round(left.aspect),
      share: left.share.map(round),
      reach: left.halfExtent.map(round),
    },
    candidate: {
      aspect: round(right.aspect),
      share: right.share.map(round),
      reach: right.halfExtent.map(round),
    },
  });

  process.stdout.write(
    `\n${kind}  (${entities.length} placements, authored aspect ${left.aspect.toFixed(2)}, ` +
      `candidate ${right.aspect.toFixed(2)})\n` +
      "  height   authored share            candidate share          authored / candidate reach\n",
  );
  for (let level = DECILES - 1; level >= 0; level -= 1) {
    // Each side prints its own reach or a dash. Suppressing the pair whenever
    // either side was empty hid the authored value in exactly the bands where the
    // candidate has no geometry — which are the bands worth reading.
    const show = (value) => (value === null ? "   -" : value.toFixed(2));
    const reachPair = `${show(left.halfExtent[level]).padStart(4)} / ${show(right.halfExtent[level])}`;
    process.stdout.write(
      `  ${String(level).padStart(2)}   ` +
        `${(left.share[level] * 100).toFixed(1).padStart(5)}% ${bar(left.share[level]).padEnd(22)}` +
        `${(right.share[level] * 100).toFixed(1).padStart(5)}% ${bar(right.share[level]).padEnd(22)}` +
        reachPair +
        "\n",
    );
  }
}

const EVIDENCE_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/full-island-reconstruction/evidence/axial-massing-v1.json",
);
const SCHEMA_VERSION = "axial-massing-v1";

if (argv.includes("--check")) {
  const recorded = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
  assert.equal(recorded.schemaVersion, SCHEMA_VERSION);
  for (const row of recorded.kinds) {
    const fresh = measured.find((entry) => entry.kind === row.kind);
    if (!fresh) continue;
    assert.deepEqual(
      fresh.authored.reach,
      row.authored.reach,
      `${row.kind}: the authored reach profile moved`,
    );
  }
  process.stdout.write(
    `
Axial massing: unchanged — ${recorded.kinds.map((row) => row.kind).join(", ")}
`,
  );
} else if (measured.length > 0) {
  // Merge rather than replace. `--kinds wish-tree,swing-tree` used to drop every other
  // kind's row from the file, which silently deleted the `lantern` and `npc-statue`
  // evidence that `test/decoration-reconstruction.test.mjs` reads — a whole-file
  // overwrite from a partial measurement. Same class of defect as the `--kinds` that
  // matched nothing and printed an empty report (ADR-0060): a development tool that
  // quietly discards evidence is worse than one that refuses.
  let existing = [];
  try {
    const recorded = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
    if (recorded.schemaVersion === SCHEMA_VERSION) existing = recorded.kinds ?? [];
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const fresh = new Set(measured.map((row) => row.kind));
  const merged = [...existing.filter((row) => !fresh.has(row.kind)), ...measured].sort(
    (left, right) => left.kind.localeCompare(right.kind),
  );

  await mkdir(path.dirname(EVIDENCE_PATH), { recursive: true });
  await writeFile(
    EVIDENCE_PATH,
    `${JSON.stringify(
      {
        schemaVersion: SCHEMA_VERSION,
        measuredAt: new Date().toISOString(),
        note:
          "Half-extent and geometry share by height decile, pooled over each kind's " +
          "placements and normalised into each entity's own box. Both subjects go " +
          "through one sampler, so a difference here is a difference the surface gate sees.",
        kinds: merged,
      },
      null,
      2,
    )}
`,
  );
  process.stdout.write(
    `
Wrote ${path.relative(PROJECT_ROOT, EVIDENCE_PATH)} (${measured.length} measured, ${merged.length} kinds on file)
`,
  );
}
