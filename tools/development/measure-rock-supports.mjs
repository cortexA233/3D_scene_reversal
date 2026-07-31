/**
 * The authored rocks' support profile, and how far inside it the candidate sits.
 *
 * `rocks` is the group in ticket 06 whose error is its own shape: pixel ratio 1.03
 * with silhouette IoU 0.359, and a contour p95 that nearly doubled to 47.9 once
 * ADR-0057 stopped the plaza covering it. Its 8.40-unit mean thickness is
 * comparable to the terrain misfit beneath it, so unlike the paving slabs it is
 * not waiting on ticket 03.
 *
 * The accepted representation for a stone is the Bounded Support-plane Polyhedron
 * — twenty-four canonical directions and a support distance along each — and the
 * scene generator does not use it. `mound` builds a ring-and-side lattice whose
 * radius is one minus half the roughness plus a random share of it, about a
 * sphere, which is a jittered sphere stretched onto the Target AABB Extent. A
 * sphere in a box touches the six face centres and falls short everywhere else.
 *
 * This measures the support distance along each canonical direction for both
 * subjects, from the same frozen samples the surface gate uses, in a frame
 * normalised so each entity's box spans -1 to 1 per axis. Absolute level does not
 * matter — the extent contract rescales the generated form anyway — so what is
 * recorded is the relative profile: how much further the form reaches in one
 * direction than another.
 *
 * Pooled over the 39 placements it is 24 means and one spread, not 39 profiles. A
 * support distance per direction per entity would be 936 numbers, and a per-entity
 * form list is not a reconstruction.
 *
 * Offline and read-only: frozen inventory, frozen samples, and the production
 * generator. Nothing is rendered.
 *
 *   node tools/development/measure-rock-supports.mjs
 *   node tools/development/measure-rock-supports.mjs --check
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { canonicalSupportDirections } from "../../gt_designer/src/reconstruction/objects/stone-generator.js";
import { ISLAND_SCENE_RECIPE } from "../../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { generateScene } from "../../gt_designer/src/reconstruction/scene/scene-generator.js";
import { observeCandidate } from "../evaluation/scene-observation.mjs";
import { readAuthoredPlacements, round } from "../reconstruction/scene-placements.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EVIDENCE = path.join(PROJECT_ROOT, ".scratch/scene-parity-foundation/evidence");
const EVIDENCE_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/full-island-reconstruction/evidence/rock-supports-v1.json",
);
const SCHEMA_VERSION = "rock-supports-v1";
const KINDS = ["rock"];
const checkOnly = process.argv.includes("--check");

const read = (name) => readFile(path.join(EVIDENCE, name), "utf8").then(JSON.parse);

function decode(flat) {
  if (Array.isArray(flat[0])) return flat;
  const out = [];
  for (let slot = 0; slot + 2 < flat.length; slot += 3) {
    out.push([flat[slot], flat[slot + 1], flat[slot + 2]]);
  }
  return out;
}

/** Support distance per canonical direction, in the entity's own normalised box. */
function supportProfile(points, anchor, extent, directions) {
  const support = new Array(directions.length).fill(-Infinity);
  const local = new THREE.Vector3();
  for (const [x, y, z] of points) {
    local.set(
      (2 * (x - anchor[0])) / extent[0],
      (2 * (y - anchor[1] - extent[1] / 2)) / extent[1],
      (2 * (z - anchor[2])) / extent[2],
    );
    directions.forEach((direction, index) => {
      const projected = local.dot(direction);
      if (projected > support[index]) support[index] = projected;
    });
  }
  return support;
}

async function main() {
  const [inventory, horizon, samples] = await Promise.all([
    read("scene-inventory-v1.json"),
    read("horizon-reference-v1.json"),
    read("scene-surface-samples-v1.json"),
  ]);
  const { placements, members } = readAuthoredPlacements(inventory, horizon);
  const byKey = new Map();
  for (const [itemPath, key] of members) {
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(itemPath);
  }
  const candidate = observeCandidate(generateScene(ISLAND_SCENE_RECIPE));
  const directions = canonicalSupportDirections();

  const kinds = [];
  for (const kind of KINDS) {
    const rows = placements.filter((placement) => placement.kind === kind);
    assert.ok(rows.length > 0, `no authored ${kind} placements`);
    const reference = [];
    const generated = [];
    for (const placement of rows) {
      const authored = decode(
        byKey.get(placement.key).flatMap((itemPath) => samples.samples[itemPath] ?? []),
      );
      const built = decode(candidate.entities.get(placement.semanticId)?.samples ?? []);
      if (authored.length > 0) {
        reference.push(supportProfile(authored, placement.anchor, placement.extent, directions));
      }
      if (built.length > 0) {
        generated.push(supportProfile(built, placement.anchor, placement.extent, directions));
      }
    }
    const mean = (list, index) => list.reduce((sum, row) => sum + row[index], 0) / list.length;
    const spread = (list, index) => {
      const centre = mean(list, index);
      return Math.sqrt(
        list.reduce((sum, row) => sum + (row[index] - centre) ** 2, 0) / list.length,
      );
    };
    const referenceSupport = directions.map((_, index) => round(mean(reference, index), 4));
    const candidateSupport = directions.map((_, index) => round(mean(generated, index), 4));
    const spreads = directions.map((_, index) => spread(reference, index));
    const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    kinds.push({
      kind,
      placements: rows.length,
      directionCount: directions.length,
      referenceSupport,
      candidateSupport,
      // One spread for the family rather than one per direction: the per-direction
      // spread is dominated by measurement noise at 96 samples per entity, and what
      // 39 rocks need is a family that varies, not 24 separate variances.
      referenceSpread: round(average(spreads), 4),
      referenceMean: round(average(referenceSupport), 4),
      candidateMean: round(average(candidateSupport), 4),
      directionsInsideReference: referenceSupport.filter(
        (value, index) => candidateSupport[index] < value,
      ).length,
    });
  }

  const evidence = {
    schemaVersion: SCHEMA_VERSION,
    measuredAt: new Date().toISOString(),
    subject: "authored and generated support profiles per canonical direction",
    note:
      "Relative profile only. The Target AABB Extent rescales the generated form, " +
      "so the absolute level carries no information and the shape is the ratio " +
      "between directions. Both subjects are measured from the same frozen samples.",
    kinds,
  };

  if (checkOnly) {
    const recorded = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
    assert.equal(recorded.schemaVersion, SCHEMA_VERSION);
    for (const row of recorded.kinds) {
      const fresh = kinds.find((entry) => entry.kind === row.kind);
      assert.ok(fresh, `${row.kind} is no longer measured`);
      assert.deepEqual(
        fresh.referenceSupport,
        row.referenceSupport,
        `${row.kind}: the authored support profile moved`,
      );
    }
    console.log(
      `Rock supports: unchanged — ${recorded.kinds
        .map((row) => `${row.kind} ref ${row.referenceMean} cand ${row.candidateMean}`)
        .join(", ")}`,
    );
    return;
  }

  await mkdir(path.dirname(EVIDENCE_PATH), { recursive: true });
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  for (const row of kinds) {
    console.log(
      `${row.kind}: ${row.placements} placements, reference mean support ${row.referenceMean}, ` +
        `candidate ${row.candidateMean}, candidate inside the reference in ` +
        `${row.directionsInsideReference} of ${row.directionCount} directions, ` +
        `spread ${row.referenceSpread}`,
    );
    console.log(`  reference profile ${JSON.stringify(row.referenceSupport)}`);
  }
  console.log(`\nWrote ${path.relative(PROJECT_ROOT, EVIDENCE_PATH)}`);
}

await main();
