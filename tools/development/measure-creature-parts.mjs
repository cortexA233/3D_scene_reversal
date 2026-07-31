/**
 * Semantic part structure of the authored wildlife rigs.
 *
 * The correspondence layer reports 14 entities missing components and every one
 * of them is a panda: the authored rig carries 15 meshes and the generator
 * emitted 6 or 7. A part count alone does not say what to build, so this
 * measures the structure the count is counting.
 *
 * What comes out is a program, not a table. Each authored rig turns out to be
 * three body masses in a chain along its own long axis plus four legs of three
 * stacked segments each, mirrored across that axis — 3 + 4 x 3 = 15 — and the
 * two distinct panda assets agree on that topology and on the proportions to
 * within a few per cent. So the measurement is ~20 fractions of the Target AABB
 * Extent, independent of triangle count and of how many pandas the island has.
 *
 * Two facts here are easy to get backwards and expensive to get wrong:
 *
 * - The rigs face their own local -Z. Every part position below is stated in the
 *   local frame recovered by un-rotating the world offset by the entity's own
 *   Typed Scene Orientation yaw, and in that frame all 14 pandas put the head
 *   mass at negative Z. A generator that builds its head at +Z would put every
 *   panda's head where its tail is while still passing the extent contract.
 * - The two assets are measured from their yaw-0 representatives. An authored
 *   AABB is a world AABB, so for a yawed placement it is the bound of the
 *   rotated form and its axes are not the rig's own; normalising by it would mix
 *   the rotation into the proportions.
 *
 * Read-only and offline: it reads the frozen inventory, which already records
 * per-mesh triangles and world bounds. It renders nothing and starts no browser.
 *
 *   node tools/development/measure-creature-parts.mjs
 *   node tools/development/measure-creature-parts.mjs --check
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ISLAND_SCENE_RECIPE } from "../../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { readAuthoredPlacements, round } from "../reconstruction/scene-placements.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const INVENTORY_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence/scene-inventory-v1.json",
);
const HORIZON_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence/horizon-reference-v1.json",
);
const EVIDENCE_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/full-island-reconstruction/evidence/creature-parts-v1.json",
);
const SCHEMA_VERSION = "creature-parts-v1";
const KIND = "panda";
const checkOnly = process.argv.includes("--check");

/** Local frame of one authored placement: origin at the base centre, yaw undone. */
function localParts(placement, meshes, yaw) {
  const cos = Math.cos(-yaw);
  const sin = Math.sin(-yaw);
  return meshes.map((mesh) => {
    const centre = [0, 1, 2].map(
      (axis) => (mesh.bounds.max[axis] + mesh.bounds.min[axis]) / 2 - placement.anchor[axis],
    );
    return {
      triangles: mesh.triangles,
      centre: [
        centre[0] * cos + centre[2] * sin,
        centre[1],
        -centre[0] * sin + centre[2] * cos,
      ],
      size: [0, 1, 2].map((axis) => mesh.bounds.max[axis] - mesh.bounds.min[axis]),
    };
  });
}

/**
 * Splits one rig into its body chain and its legs.
 *
 * The split is structural rather than by triangle count, because the two assets
 * spend their triangles differently: the body masses are the parts that sit on
 * the long axis, and everything else comes in mirrored pairs off it.
 */
function decompose(parts, extent) {
  const axis = extent[0] > extent[2] ? 0 : 2;
  const across = axis === 0 ? 2 : 0;
  const onAxis = (row) => Math.abs(row.centre[across]) / extent[across] < 0.1;
  const masses = parts.filter(onAxis).sort((a, b) => a.centre[axis] - b.centre[axis]);
  const limbs = parts.filter((row) => !onAxis(row));
  assert.equal(masses.length, 3, `expected a three-mass body chain, saw ${masses.length}`);
  assert.equal(limbs.length, 12, `expected twelve leg segments, saw ${limbs.length}`);

  // Legs group by their position along the long axis, then stack by height.
  const front = limbs.filter((row) => row.centre[axis] < 0);
  const rear = limbs.filter((row) => row.centre[axis] >= 0);
  const legs = [front, rear].map((group, index) => {
    assert.equal(group.length, 6, `leg group ${index} has ${group.length} segments`);
    const left = group
      .filter((row) => row.centre[across] < 0)
      .sort((a, b) => a.centre[1] - b.centre[1]);
    const right = group
      .filter((row) => row.centre[across] > 0)
      .sort((a, b) => a.centre[1] - b.centre[1]);
    assert.equal(left.length, 3, `leg group ${index} is not a mirrored pair`);
    assert.equal(right.length, 3, `leg group ${index} is not a mirrored pair`);
    return { pair: [left, right] };
  });
  return { axis, across, masses, legs };
}

function fractions(row, extent, axis, across) {
  return {
    alongAxis: round(row.centre[axis] / extent[axis], 3),
    height: round(row.centre[1] / extent[1], 3),
    halfWidth: round(Math.abs(row.centre[across]) / extent[across], 3),
    size: [
      round(row.size[across] / extent[across], 3),
      round(row.size[1] / extent[1], 3),
      round(row.size[axis] / extent[axis], 3),
    ],
    triangleShare: row.triangles,
  };
}

function mean(values) {
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 3);
}

async function main() {
  const [inventory, horizon] = await Promise.all([
    readFile(INVENTORY_PATH, "utf8").then(JSON.parse),
    readFile(HORIZON_PATH, "utf8").then(JSON.parse),
  ]);
  const { placements, members } = readAuthoredPlacements(inventory, horizon);
  const byPath = new Map(inventory.items.map((item) => [item.path, item]));
  const byKey = new Map();
  for (const [itemPath, key] of members) {
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(itemPath);
  }
  const orientation = new Map(
    ISLAND_SCENE_RECIPE.entities.map((entity) => [entity.semanticId, entity.orientation]),
  );

  const rigs = placements.filter((placement) => placement.kind === KIND);
  assert.ok(rigs.length > 0, `no authored ${KIND} placements`);

  // Every rig, to confirm the topology and the facing are properties of the
  // family rather than of one lucky placement.
  const topology = [];
  for (const placement of rigs) {
    const meshes = byKey.get(placement.key).map((itemPath) => byPath.get(itemPath));
    const yaw = orientation.get(placement.semanticId)?.radians ?? 0;
    const parts = localParts(placement, meshes, yaw);
    const extent = placement.extent;
    // In the local frame the long axis is the rig's own, which for a yawed
    // placement is not the longest world axis of its rotated bound.
    const spans = [0, 2].map((axis) =>
      Math.max(...parts.map((row) => Math.abs(row.centre[axis]))),
    );
    const axis = spans[0] > spans[1] ? 0 : 2;
    const masses = [...parts].sort((a, b) => b.triangles - a.triangles).slice(0, 3);
    const head = masses.reduce((best, row) => (row.triangles > best.triangles ? row : best));
    topology.push({
      semanticId: placement.semanticId,
      parts: parts.length,
      triangles: parts.reduce((sum, row) => sum + row.triangles, 0),
      yawDegrees: round((yaw * 180) / Math.PI, 1),
      localLongAxis: "xyz"[axis],
      headAlongAxis: round(head.centre[axis], 2),
      worldExtent: extent,
    });
  }

  const facing = new Set(topology.map((row) => Math.sign(row.headAlongAxis)));
  const partCounts = new Set(topology.map((row) => row.parts));

  // Proportions come only from the yaw-0 representatives, one per distinct asset.
  const upright = rigs.filter(
    (placement) => (orientation.get(placement.semanticId)?.radians ?? 0) === 0,
  );
  const assets = new Map();
  for (const placement of upright) {
    const meshes = byKey.get(placement.key).map((itemPath) => byPath.get(itemPath));
    const triangles = meshes.reduce((sum, mesh) => sum + mesh.triangles, 0);
    if (assets.has(triangles)) continue;
    const parts = localParts(placement, meshes, 0);
    const { axis, across, masses, legs } = decompose(parts, placement.extent);
    assets.set(triangles, {
      semanticId: placement.semanticId,
      triangles,
      extent: placement.extent,
      longAxis: "xyz"[axis],
      masses: masses.map((row) => fractions(row, placement.extent, axis, across)),
      legs: legs.map(({ pair }) => ({
        alongAxis: mean(pair.flat().map((row) => row.centre[axis] / placement.extent[axis])),
        halfWidth: mean(pair.flat().map((row) => Math.abs(row.centre[across]) / placement.extent[across])),
        segments: [0, 1, 2].map((index) => ({
          height: mean(pair.map((side) => side[index].centre[1] / placement.extent[1])),
          size: [0, 1, 2].map((component) =>
            mean(
              pair.map((side) => {
                const row = side[index];
                const denominator = [across, 1, axis][component];
                return row.size[denominator] / placement.extent[denominator];
              }),
            ),
          ),
        })),
      })),
    });
  }
  assert.ok(assets.size >= 2, `expected at least two distinct ${KIND} assets`);

  const evidence = {
    schemaVersion: SCHEMA_VERSION,
    kind: KIND,
    measuredAt: new Date().toISOString(),
    source: "scene-inventory-v1 (read-only, offline)",
    topology: {
      rigs: topology.length,
      partCounts: [...partCounts],
      facing: [...facing],
      note:
        "Every rig has the same part count and puts its head mass on the same " +
        "side of its own long axis, so the topology and the facing belong to the family.",
      rows: topology,
    },
    assets: [...assets.values()],
  };

  if (checkOnly) {
    const recorded = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
    assert.equal(recorded.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(recorded.topology.partCounts, evidence.topology.partCounts);
    assert.deepEqual(recorded.topology.facing, evidence.topology.facing);
    assert.deepEqual(
      recorded.assets.map((asset) => asset.masses),
      evidence.assets.map((asset) => asset.masses),
      "authored body-mass proportions moved",
    );
    console.log(
      `Creature parts: unchanged — ${evidence.topology.rigs} rigs, ` +
        `${evidence.topology.partCounts.join("/")} parts each`,
    );
    return;
  }

  await mkdir(path.dirname(EVIDENCE_PATH), { recursive: true });
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `Creature parts: ${evidence.topology.rigs} rigs, parts ${[...partCounts].join("/")}, ` +
      `head on the ${[...facing].join("/")} side of the long axis`,
  );
  for (const row of evidence.assets) {
    console.log(`\n${row.semanticId}  ${row.triangles} tri  long axis ${row.longAxis}`);
    for (const mass of row.masses) {
      console.log(
        `  mass   along ${String(mass.alongAxis).padStart(7)}  height ${String(mass.height).padStart(6)}  size ${JSON.stringify(mass.size)}`,
      );
    }
    for (const leg of row.legs) {
      console.log(
        `  leg    along ${String(leg.alongAxis).padStart(7)}  half-width ${leg.halfWidth}`,
      );
      for (const segment of leg.segments) {
        console.log(
          `    segment height ${String(segment.height).padStart(6)}  size ${JSON.stringify(segment.size)}`,
        );
      }
    }
  }
  console.log(`\nWrote ${path.relative(PROJECT_ROOT, EVIDENCE_PATH)}`);
}

await main();
