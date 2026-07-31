/**
 * The three shared crest tables ADR-0052 named, and whether a group can be rebuilt from one.
 *
 * ADR-0052 recorded the skyline gate as unreachable and named the way through — cluster the
 * sixteen Horizon Groups by measured shape, carry one crest table per family — as the next
 * step rather than taken. This file takes it, and the answer is that ADR-0052 was right.
 *
 * A bound is not a build, and this is the step between them. It persists the tables and then
 * asks what the bound does not: reconstruct each group's own profile from its family's table
 * plus its own offset and range, and how far off is it? That check is the whole point, and it
 * caught a wrong answer — an earlier version of the shared cost let every member interpolate
 * through *its own* values at the shared node positions, which measures a representation
 * costing one value per node per group rather than one shared table, and reported 0.680
 * degrees where a real shared table gets 3.670.
 *
 * The corrected result: a shared table saturates at **3.670 degrees regardless of node
 * count** — 16, 24, 32, 40 and 48 all give the same number — because the error is set by how
 * much a family's members differ from *each other*, not by how finely the table is sampled.
 * No node budget reaches the 0.945 threshold. The representation that does reach it is
 * per-group values at shared positions, which is 640 numbers for a 720-bin skyline and is
 * exactly the sampled skyline ADR-0052 prohibits.
 *
 * Reference-only. It reads the frozen horizon evidence and the frozen baseline, and writes
 * one evidence file. No candidate module is loaded and nothing is rendered.
 *
 *   node tools/development/fit-horizon-families.mjs
 *   node tools/development/fit-horizon-families.mjs --families 3 --nodes 40
 *   node tools/development/fit-horizon-families.mjs --check
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  bestSharedPiecewise,
  clusterShapes,
  normaliseProfile,
} from "./measure-horizon-form-budget.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EVIDENCE_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/full-island-reconstruction/evidence/horizon-family-v1.json",
);
const SCHEMA_VERSION = "horizon-family-v1";
const SAMPLES = 64;

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? Number(argv[index + 1]) : fallback;
};
const readJson = (relative) =>
  readFile(path.join(PROJECT_ROOT, relative), "utf8").then(JSON.parse);

/** Linear interpolation of a table sampled on `[0, 1]` at `count` even points. */
function sampleTable(table, position) {
  const at = Math.min(1, Math.max(0, position)) * (table.length - 1);
  const low = Math.floor(at);
  const high = Math.min(table.length - 1, low + 1);
  return table[low] + (table[high] - table[low]) * (at - low);
}

async function main() {
  const familyCount = flag("--families", 3);
  const nodeCount = flag("--nodes", 40);

  const [reference, baseline] = await Promise.all([
    readJson(".scratch/scene-parity-foundation/evidence/horizon-reference-v1.json"),
    readJson("tools/acceptance/baselines/scene-quality-baseline-v1.json"),
  ]);
  const threshold = baseline.layers.worldGeometry.find(
    (metric) => metric.name === "worst azimuth horizon error",
  ).threshold;

  const groups = [];
  for (const group of reference.groups) {
    const covered = group.profile.filter((value) => value !== null);
    if (covered.length < 4) continue;
    groups.push({
      semanticId: group.semanticId ?? null,
      path: group.path,
      bins: covered.length,
      covered,
      ...normaliseProfile(covered, SAMPLES),
    });
  }
  assert.ok(groups.length >= 3, `only ${groups.length} horizon groups have a profile`);

  // Families from measured shape. ADR-0052 is explicit that the source mesh identity may
  // not be used, so nothing here reads a name.
  const { assignment } = clusterShapes(
    groups.map((group) => group.shape),
    familyCount,
  );

  const families = [];
  for (let slot = 0; slot < familyCount; slot += 1) {
    const members = groups.filter((_, index) => assignment[index] === slot);
    if (members.length === 0) continue;
    const { error, breakpoints, table: sharedValues } = bestSharedPiecewise(
      members,
      nodeCount - 1,
    );
    // The same fit with per-member node values, for contrast: it is the representation
    // ADR-0052 rejected, and quantifying it is what shows the shared table is the only
    // compact option and that it does not work.
    const perGroupValues = bestSharedPiecewise(members, nodeCount - 1, { shared: false });
    /**
     * The shared table itself. The breakpoints say where the segments meet; the table's
     * value at each is the members' mean there, which is the value that minimises no
     * member's error in particular and every member's error jointly — the same reason the
     * clustering uses medoids rather than one member as an exemplar.
     */
    const table = sharedValues.map((value) => Number(value.toFixed(6)));
    families.push({
      family: families.length,
      members: members.length,
      // Where each node sits along the group's own normalised azimuth span.
      nodeAt: breakpoints.map((index) => Number((index / (SAMPLES - 1)).toFixed(6))),
      table,
      boundRadians: Number(error.toFixed(8)),
      // What the same node positions achieve if every group carries its own values.
      perGroupValueBoundRadians: Number(perGroupValues.error.toFixed(8)),
    });
  }

  /**
   * The check this file exists for: rebuild each group's profile from its family's table
   * plus its own offset and range, and measure the worst per-azimuth error against the
   * profile the gate actually reads.
   *
   * This is not the bound. The bound is what an optimal shared piecewise-linear function
   * achieves; this is what *this* table achieves after being reduced to node values and
   * interpolated back, which is what a generator would carry.
   */
  const rebuilt = groups.map((group, index) => {
    const family = families[assignment[index]];
    let worst = 0;
    for (let bin = 0; bin < group.covered.length; bin += 1) {
      const position = group.covered.length === 1 ? 0 : bin / (group.covered.length - 1);
      // Node positions are uneven, so the table is read by its own node parameterisation.
      let value = family.table[family.table.length - 1];
      for (let node = 0; node + 1 < family.nodeAt.length; node += 1) {
        if (position > family.nodeAt[node + 1]) continue;
        const span = family.nodeAt[node + 1] - family.nodeAt[node];
        const along = span > 0 ? (position - family.nodeAt[node]) / span : 0;
        value =
          family.table[node] + (family.table[node + 1] - family.table[node]) * Math.min(1, Math.max(0, along));
        break;
      }
      const error = Math.abs(group.offset + group.range * value - group.covered[bin]);
      if (error > worst) worst = error;
    }
    return {
      path: group.path,
      family: assignment[index],
      bins: group.bins,
      // Two numbers per group on top of the family index and the placement it already has.
      offset: Number(group.offset.toFixed(8)),
      range: Number(group.range.toFixed(8)),
      worstRadians: Number(worst.toFixed(8)),
    };
  });

  const worstRebuilt = Math.max(...rebuilt.map((row) => row.worstRadians));
  const worstBound = Math.max(...families.map((family) => family.boundRadians));
  const evidence = {
    schemaVersion: SCHEMA_VERSION,
    authority: "Assembled Authored Scene",
    subject: "shared Horizon Group crest families",
    measuredAt: new Date().toISOString(),
    note:
      "Families clustered from measured profile shape, never from the source mesh identity " +
      "(ADR-0052). One shared table per family plus an offset and a range per group. " +
      "`worstRebuilt` is the number that matters: it is what this table achieves after being " +
      "reduced to node values and interpolated back, which is what a generator carries, " +
      "rather than the optimal bound.",
    thresholdRadians: threshold,
    familyCount: families.length,
    nodeCount,
    numbersPerGroup: (families.length * nodeCount + groups.length * 3) / groups.length,
    worstBoundRadians: Number(worstBound.toFixed(8)),
    worstRebuiltRadians: Number(worstRebuilt.toFixed(8)),
    reachesThreshold: worstRebuilt <= threshold,
    families,
    groups: rebuilt,
  };

  if (argv.includes("--check")) {
    const recorded = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
    assert.equal(recorded.schemaVersion, SCHEMA_VERSION);
    assert.equal(recorded.worstRebuiltRadians, evidence.worstRebuiltRadians);
    assert.equal(recorded.reachesThreshold, evidence.reachesThreshold);
    process.stdout.write(
      `Horizon families: unchanged — ${recorded.familyCount} families at ${recorded.nodeCount} nodes, ` +
        `worst rebuilt ${((recorded.worstRebuiltRadians * 180) / Math.PI).toFixed(3)} deg\n`,
    );
    return;
  }

  await mkdir(path.dirname(EVIDENCE_PATH), { recursive: true });
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

  const degrees = (radians) => ((radians * 180) / Math.PI).toFixed(3);
  process.stdout.write(
    `${families.length} families at ${nodeCount} nodes, ${groups.length} groups, ` +
      `${evidence.numbersPerGroup.toFixed(1)} numbers per group\n\n` +
      `family  members  optimal bound  \n`,
  );
  for (const family of families) {
    process.stdout.write(
      `${String(family.family).padStart(6)}  ${String(family.members).padStart(7)}  ` +
        `${degrees(family.boundRadians).padStart(13)}\n`,
    );
  }
  process.stdout.write(`\nper group: worst rebuilt error (deg)\n`);
  for (const row of rebuilt.sort((a, b) => b.worstRadians - a.worstRadians)) {
    process.stdout.write(
      `  family ${row.family}  bins ${String(row.bins).padStart(3)}  ` +
        `${degrees(row.worstRadians).padStart(7)}  ${row.path.split("/").pop()}\n`,
    );
  }
  process.stdout.write(
    `\nworst optimal bound   ${degrees(worstBound)} deg\n` +
      `worst rebuilt         ${degrees(worstRebuilt)} deg\n` +
      `frozen threshold      ${degrees(threshold)} deg\n` +
      `${evidence.reachesThreshold ? "REACHES the threshold" : "does NOT reach the threshold"}\n` +
      `\nWrote ${path.relative(PROJECT_ROOT, EVIDENCE_PATH)}\n`,
  );
}

await main();
