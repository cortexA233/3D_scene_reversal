/**
 * What an authored ground plate's footprint actually covers.
 *
 * Human Parity Review named the village, and the per-group rendered evidence says
 * which part of it: `plazas` draws 1.89 times the reference's pixels at a
 * silhouette IoU of 0.367, and `bridges` 2.11. The generator's plaza is two
 * stacked boxes that fill their Target AABB Extent, and the authored plates do
 * not fill theirs — measured from the frozen inventory, surface area over
 * bounding-rectangle area is 0.34 for one plaza and 0.23 to 0.25 for all four
 * decks, against roughly 2.0 for a solid box of the same box.
 *
 * That is a shape fact, and it is the reason this measurement had to exist before
 * the generator was touched. Reducing coverage without matching *where* the
 * coverage is would make the silhouette worse, not better: a candidate that fills
 * its box scores IoU ≈ the reference's coverage, which is the 0.367 already
 * observed, while a candidate covering the right fraction in the wrong places
 * scores coverage squared over twice-coverage-minus-its-square — about 0.21 for a
 * plate covering a third of its box. Getting the amount right and the position
 * wrong is a regression that looks like a fix in the pixel ratio.
 *
 * So the footprint is measured at real resolution rather than from the 96 gate
 * samples, which can occupy at most 96 of a grid's cells and cannot separate a
 * sparse plate from an under-sampled one. Per distinct asset it records:
 *
 * - **coverage**, the fraction of the bounding rectangle the geometry projects
 *   onto, from a fine raster reduced to one number;
 * - **the vertical area profile**, which says whether the plate is a slab, a
 *   surface with a rim, or a stepped terrace;
 * - **an axis-aligned rectangle decomposition** of the projected footprint, up to
 *   a bounded count, which is the compact form a generator can actually build.
 *   A radial outline cannot describe these plates: the occupancy has holes, and a
 *   ring is exactly what a radius per azimuth cannot say.
 *
 * Assets are identified by their triangle count and surface area, the same way
 * the creature measurement identifies rigs, so four decks that are one asset
 * placed four times are measured once and reported once.
 *
 * Read-only. It runs the reference's own inventory page, reads geometry already in
 * memory, renders nothing, and loads no candidate module.
 *
 *   node tools/development/measure-plate-footprint.mjs
 *   node tools/development/measure-plate-footprint.mjs --check
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "../../scripts/lib/smoke-local-scene.mjs";
import { readAuthoredPlacements } from "../reconstruction/scene-placements.mjs";
import { createFrozenObservationClockPreload } from "../reference/frozen-observation-clock.mjs";
import { createReferenceObservationContract } from "../reference/reference-observation-contract.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const EVIDENCE_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/full-island-reconstruction/evidence/plate-footprint-v1.json",
);
const SCHEMA_VERSION = "plate-footprint-v1";
const checkOnly = process.argv.includes("--check");
const contract = createReferenceObservationContract();

/**
 * The kinds this measures. They are the repository's own classification of an
 * authored placement rather than anything in the authored names — the village's
 * child nodes are individual meshes with asset names, so `plaza` and `deck` exist
 * only as a resolved family — and the placements are therefore resolved offline
 * and their mesh paths handed to the page.
 */
const PLATE_KINDS = ["plaza", "deck", "bridge"];
const RASTER = 96;
const MAX_RECTANGLES = 6;

/**
 * The measurement, evaluated inside the reference page.
 *
 * It imports nothing and reads only the ready runtime's scene graph. The village
 * placement key is recomputed here rather than imported for the same reason the
 * cover measurement recomputes its own: the page has no module boundary to the
 * repository's development tools.
 */
const measureExpression = (targets) => String.raw`(async () => {
  const TARGETS = ${JSON.stringify(targets)};
  const RASTER = ${RASTER};
  const MAX_RECTANGLES = ${MAX_RECTANGLES};
  const round = (value, digits = 4) => {
    if (!Number.isFinite(value)) return null;
    const result = Number(value.toFixed(digits));
    return Object.is(result, -0) ? 0 : result;
  };

  const runtime = window.island;
  if (!runtime || !runtime.ready) return { error: "the reference runtime is not ready" };

  // The same development-only path key the frozen inventory uses, so a mesh here
  // joins to a placement resolved offline without depending on array order.
  const stableName = (value) => String(value || "").replace(/[^A-Za-z0-9_.-]+/g, "_");
  const wanted = new Map();
  for (const target of TARGETS) {
    for (const meshPath of target.paths) wanted.set(meshPath, target.semanticId);
  }
  const byOwner = new Map();
  const visit = (object, parentPath, index) => {
    const key = parentPath + "/" + String(index).padStart(4, "0") + ":" +
      stableName(object.type) + ":" + stableName(object.name);
    const owner = wanted.get(key);
    if (object.isMesh && owner) {
      if (!byOwner.has(owner)) byOwner.set(owner, []);
      byOwner.get(owner).push(object);
    }
    object.children.forEach((child, childIndex) => visit(child, key, childIndex));
  };
  visit(runtime.scene, "", 0);
  if (byOwner.size === 0) return { error: "none of the requested plate meshes were found" };

  const rows = [];
  for (const [semanticId, meshes] of byOwner) {
    // World-space triangles, and the entity box they live in.
    const triangles = [];
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const mesh of meshes) {
      mesh.updateMatrixWorld(true);
      const geometry = mesh.geometry;
      const position = geometry.getAttribute("position");
      if (!position) continue;
      const index = geometry.getIndex();
      const count = index ? index.count : position.count;
      const matrix = mesh.matrixWorld.elements;
      const transform = (slot) => {
        const vertex = index ? index.getX(slot) : slot;
        const x = position.getX(vertex);
        const y = position.getY(vertex);
        const z = position.getZ(vertex);
        return [
          matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
          matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
          matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
        ];
      };
      for (let slot = 0; slot + 2 < count; slot += 3) {
        const corners = [transform(slot), transform(slot + 1), transform(slot + 2)];
        triangles.push(corners);
        for (const corner of corners) {
          for (let axis = 0; axis < 3; axis += 1) {
            if (corner[axis] < min[axis]) min[axis] = corner[axis];
            if (corner[axis] > max[axis]) max[axis] = corner[axis];
          }
        }
      }
    }
    if (triangles.length === 0) continue;
    const extent = [0, 1, 2].map((axis) => Math.max(1e-6, max[axis] - min[axis]));

    // Rasterise the horizontal projection by scan-converting each triangle, so
    // coverage is the area the plate really shadows rather than where samples fell.
    const occupancy = new Uint8Array(RASTER * RASTER);
    let area = 0;
    const heightBins = new Array(10).fill(0);
    for (const [a, b, c] of triangles) {
      const cross = [
        (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
        (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
      ];
      const triangleArea = 0.5 * Math.hypot(cross[0], cross[1], cross[2]);
      area += triangleArea;
      const centreY = (a[1] + b[1] + c[1]) / 3;
      const decile = Math.min(9, Math.max(0, Math.floor(((centreY - min[1]) / extent[1]) * 10)));
      heightBins[decile] += triangleArea;

      const cell = (point) => [
        ((point[0] - min[0]) / extent[0]) * RASTER,
        ((point[2] - min[2]) / extent[2]) * RASTER,
      ];
      const [pa, pb, pc] = [cell(a), cell(b), cell(c)];
      const lowU = Math.max(0, Math.floor(Math.min(pa[0], pb[0], pc[0])));
      const highU = Math.min(RASTER - 1, Math.ceil(Math.max(pa[0], pb[0], pc[0])));
      const lowV = Math.max(0, Math.floor(Math.min(pa[1], pb[1], pc[1])));
      const highV = Math.min(RASTER - 1, Math.ceil(Math.max(pa[1], pb[1], pc[1])));
      const denominator =
        (pb[1] - pc[1]) * (pa[0] - pc[0]) + (pc[0] - pb[0]) * (pa[1] - pc[1]);
      for (let v = lowV; v <= highV; v += 1) {
        for (let u = lowU; u <= highU; u += 1) {
          if (occupancy[v * RASTER + u]) continue;
          const px = u + 0.5;
          const pz = v + 0.5;
          if (Math.abs(denominator) < 1e-12) {
            occupancy[v * RASTER + u] = 1;
            continue;
          }
          const w0 = ((pb[1] - pc[1]) * (px - pc[0]) + (pc[0] - pb[0]) * (pz - pc[1])) / denominator;
          const w1 = ((pc[1] - pa[1]) * (px - pc[0]) + (pa[0] - pc[0]) * (pz - pc[1])) / denominator;
          const w2 = 1 - w0 - w1;
          if (w0 >= -0.02 && w1 >= -0.02 && w2 >= -0.02) occupancy[v * RASTER + u] = 1;
        }
      }
    }

    let covered = 0;
    for (let cell = 0; cell < occupancy.length; cell += 1) covered += occupancy[cell];
    const coverage = covered / (RASTER * RASTER);

    /**
     * A greedy axis-aligned rectangle decomposition of the occupied cells: at
     * each step take the largest all-occupied rectangle not yet claimed. It is
     * the compact form a generator can build, and stopping at a bounded count is
     * what keeps it a program rather than a mask.
     */
    const claimed = new Uint8Array(occupancy);
    const rectangles = [];
    for (let step = 0; step < MAX_RECTANGLES; step += 1) {
      let best = null;
      const heights = new Array(RASTER).fill(0);
      for (let v = 0; v < RASTER; v += 1) {
        for (let u = 0; u < RASTER; u += 1) {
          heights[u] = claimed[v * RASTER + u] ? heights[u] + 1 : 0;
        }
        // Largest rectangle in the histogram, tracked with its left edge.
        const stack = [];
        for (let u = 0; u <= RASTER; u += 1) {
          const height = u === RASTER ? 0 : heights[u];
          let start = u;
          while (stack.length > 0 && stack[stack.length - 1][1] >= height) {
            const [left, tall] = stack.pop();
            const size = tall * (u - left);
            if (!best || size > best.size) {
              best = { size, u0: left, u1: u, v0: v - tall + 1, v1: v + 1 };
            }
            start = left;
          }
          if (height > 0) stack.push([start, height]);
        }
      }
      if (!best || best.size < RASTER * RASTER * 0.005) break;
      for (let v = best.v0; v < best.v1; v += 1) {
        for (let u = best.u0; u < best.u1; u += 1) claimed[v * RASTER + u] = 0;
      }
      rectangles.push({
        centre: [
          round(((best.u0 + best.u1) / 2) / RASTER - 0.5, 3),
          round(((best.v0 + best.v1) / 2) / RASTER - 0.5, 3),
        ],
        size: [
          round((best.u1 - best.u0) / RASTER, 3),
          round((best.v1 - best.v0) / RASTER, 3),
        ],
        coverageShare: round(best.size / (RASTER * RASTER), 4),
      });
    }
    let remaining = 0;
    for (let cell = 0; cell < claimed.length; cell += 1) remaining += claimed[cell];

    rows.push({
      semanticId,
      meshes: meshes.length,
      triangles: triangles.length,
      surfaceArea: round(area, 1),
      extent: extent.map((value) => round(value, 2)),
      footprintArea: round(extent[0] * extent[2], 1),
      areaOverFootprint: round(area / (extent[0] * extent[2]), 3),
      coverage: round(coverage, 4),
      thicknessOverDiagonal: round(extent[1] / Math.hypot(extent[0], extent[2]), 4),
      verticalAreaProfile: heightBins.map((value) => round(value / area, 3)),
      rectangles,
      rectangleCoverage: round(
        rectangles.reduce((sum, rectangle) => sum + rectangle.coverageShare, 0),
        4,
      ),
      unclaimedCoverage: round(remaining / (RASTER * RASTER), 4),
    });
  }

  return { raster: RASTER, requested: TARGETS.length, plates: rows };
})()`;

/**
 * Readiness for the inventory page. Without it the harness polls its default
 * probe, which reads a `data-state` attribute the inventory page never sets, and
 * waits for a ready signal that cannot arrive.
 */
const PROBE_EXPRESSION = `(() => {
  const inventory = window.sceneInventory;
  return {
    state: inventory?.status === "error" ? "error" : null,
    status: inventory?.status ?? null,
    statusText: inventory?.error ?? null,
  };
})()`;

function assetKey(row) {
  return `${row.triangles}:${row.surfaceArea}`;
}

async function main() {
  if (checkOnly) {
    const recorded = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
    assert.equal(recorded.schemaVersion, SCHEMA_VERSION);
    assert.ok(recorded.assets.length > 0, "no plate assets recorded");
    for (const asset of recorded.assets) {
      assert.ok(
        asset.coverage > 0 && asset.coverage <= 1,
        `${asset.kind} has an impossible coverage`,
      );
      assert.ok(
        asset.rectangleCoverage <= asset.coverage + 1e-6,
        `${asset.kind}'s rectangles claim more than the footprint`,
      );
    }
    console.log(
      `Plate footprint: unchanged — ${recorded.assets.length} assets, coverage ` +
        recorded.assets.map((asset) => asset.coverage).join(", "),
    );
    return;
  }

  const inventory = JSON.parse(
    await readFile(path.join(PROJECT_ROOT, ".scratch/scene-parity-foundation/evidence/scene-inventory-v1.json"), "utf8"),
  );
  const horizon = JSON.parse(
    await readFile(path.join(PROJECT_ROOT, ".scratch/scene-parity-foundation/evidence/horizon-reference-v1.json"), "utf8"),
  );
  const { placements, members } = readAuthoredPlacements(inventory, horizon);
  const byKey = new Map();
  for (const [meshPath, key] of members) {
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(meshPath);
  }
  const targets = placements
    .filter((placement) => PLATE_KINDS.includes(placement.kind))
    .map((placement) => ({
      semanticId: placement.semanticId,
      kind: placement.kind,
      paths: byKey.get(placement.key) ?? [],
    }));
  assert.ok(targets.length > 0, `no placements of ${PLATE_KINDS.join(", ")}`);

  const run = await runLocalSceneAutomation({
    label: "plate-footprint",
    serverFlag: "--scene-inventory",
    path: "/scene-inventory.html",
    query: `?${new URLSearchParams(contract.reference.urlOptions).toString()}`,
    readyState: { status: "ready" },
    timeoutMs: 300_000,
    port: 8502,
    probeExpression: PROBE_EXPRESSION,
    preloadScript: createFrozenObservationClockPreload(contract.clock),
    viewport: {
      width: contract.capture.cssViewport[0],
      height: contract.capture.cssViewport[1],
      deviceScaleFactor: contract.capture.deviceScaleFactor,
    },
    blockExternalNetwork: false,
    allowedExternalRequestUrls: [contract.renderContract.ocean.normalMapUrl],
    postReadyExpression: measureExpression(targets),
  });
  assert.equal(run.state?.error, undefined, run.state?.error);
  const plates = run.state?.plates ?? [];
  assert.equal(
    plates.length,
    targets.length,
    `asked for ${targets.length} plates and measured ${plates.length}`,
  );
  const kindOf = new Map(targets.map((target) => [target.semanticId, target.kind]));
  for (const row of plates) row.kind = kindOf.get(row.semanticId);

  // One row per distinct asset; repeated placements of one asset agree by
  // construction because the measurement is normalised into each own box.
  const assets = new Map();
  for (const row of plates) {
    const key = assetKey(row);
    if (!assets.has(key)) assets.set(key, { ...row, placements: [] });
    assets.get(key).placements.push(row.semanticId);
  }

  const evidence = {
    schemaVersion: SCHEMA_VERSION,
    authority: contract.authority,
    subject: "the Assembled Authored Scene's village ground plates",
    measuredAt: new Date().toISOString(),
    raster: run.state.raster,
    note:
      "Horizontal coverage by triangle scan-conversion rather than by surface " +
      "sample, because 96 samples cannot separate a sparse plate from an " +
      "under-sampled one. Reducing a candidate's coverage without matching where " +
      "the coverage is lowers the silhouette IoU while improving the pixel ratio, " +
      "so the rectangle decomposition is the part a generator needs.",
    placements: plates.length,
    assets: [...assets.values()],
  };

  await mkdir(path.dirname(EVIDENCE_PATH), { recursive: true });
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(`Plate footprint: ${plates.length} placements, ${assets.size} distinct assets`);
  console.log(
    "kind             tri   area/foot  coverage  thick/diag  rects  claimed  left",
  );
  for (const asset of evidence.assets) {
    console.log(
      `${asset.kind} x${asset.placements.length}`.padEnd(16),
      String(asset.triangles).padStart(5),
      String(asset.areaOverFootprint).padStart(10),
      String(asset.coverage).padStart(9),
      String(asset.thicknessOverDiagonal).padStart(11),
      String(asset.rectangles.length).padStart(6),
      String(asset.rectangleCoverage).padStart(8),
      String(asset.unclaimedCoverage).padStart(6),
    );
    console.log(`    vertical area profile ${JSON.stringify(asset.verticalAreaProfile)}`);
    for (const rectangle of asset.rectangles) {
      console.log(
        `    rect centre ${JSON.stringify(rectangle.centre)} size ${JSON.stringify(rectangle.size)} share ${rectangle.coverageShare}`,
      );
    }
  }
  console.log(`\nWrote ${path.relative(PROJECT_ROOT, EVIDENCE_PATH)}`);
}

await main();
