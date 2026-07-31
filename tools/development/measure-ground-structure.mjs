/**
 * What an authored placement's *lower* geometry looks like in plan.
 *
 * `structures` is 40 per cent authored pixels in two tree kinds, and both are
 * missing their ground structure rather than their canopy: authored base reach is
 * 0.616 to 0.661 in the bottom three height deciles against a candidate 0.095 to
 * 0.314, because the placement is a tree *plus its structure* — a swing's frame, a
 * wish rack — and `broadleaf` puts a bare trunk on the axis.
 *
 * Ticket 07 records that the number of uprights is "not recoverable from a radially
 * averaged profile", which is true of the profile and not of the subject. A radial
 * mean over height deciles cannot separate three posts at radius 0.65 from a solid
 * cylinder of radius 0.65 — but a scan conversion of the horizontal projection
 * restricted to that height band separates them immediately, because one is three
 * blobs and the other is a disc. So this measures the thing the profile cannot say,
 * at full triangle resolution rather than from the 96 gate samples.
 *
 * Per placement, over the geometry whose triangle centres fall inside the bottom
 * `--band` fraction of the entity's own height:
 *
 * - **connected components** of the rasterised footprint, 4-connected, each with its
 *   own centroid, Chebyshev radius, and share of the band's occupancy. The count is
 *   the upright count the reach profile cannot carry.
 * - **areaShare**, the band's surface area over the whole placement's, which is the
 *   same quantity `axial-massing-v1.json` calls `share` summed over those deciles —
 *   recorded here so the two measurements can be checked against each other.
 * - **reach**, the area-weighted mean Chebyshev radius of the band's triangles,
 *   normalised by each axis's own half-extent exactly as the massing tool does, so a
 *   candidate built to this file is built to a number the massing comparison also reads.
 *
 * The distinction matters because reach is a *mean*: a thin frame at radius 0.6 reads
 * 0.6 while carrying almost no area, and a solid column there would draw about seven
 * times the silhouette width down low. Matching the pair — share and reach together —
 * needs to know how many pieces the area is divided into, and that is this file.
 *
 * Read-only. It runs the reference's own inventory page, reads geometry already in
 * memory, renders nothing, and loads no candidate module.
 *
 *   node tools/development/measure-ground-structure.mjs
 *   node tools/development/measure-ground-structure.mjs --kinds wish-tree,swing-tree
 *   node tools/development/measure-ground-structure.mjs --check
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "../../scripts/lib/smoke-local-scene.mjs";
import { readAuthoredPlacements } from "../reconstruction/scene-placements.mjs";
import { createFrozenObservationClockPreload } from "../reference/frozen-observation-clock.mjs";
import { createReferenceObservationContract } from "../reference/reference-observation-contract.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EVIDENCE_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/full-island-reconstruction/evidence/ground-structure-v1.json",
);
const SCHEMA_VERSION = "ground-structure-v1";

const argv = process.argv.slice(2);
const flag = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
};
const checkOnly = argv.includes("--check");
const contract = createReferenceObservationContract();

/**
 * The two kinds this was written for. Both have enough placements to support a
 * family program — three wish trees and five swings — unlike the single-placement
 * pavilions whose thin evidence sank the bridge attempt.
 */
const DEFAULT_KINDS = ["wish-tree", "swing-tree"];
const RASTER = 96;
/**
 * The bottom three height deciles, which is the band `axial-massing-v1.json` reports
 * the authored/candidate reach disagreement over. Not a fitted value: it is the band
 * the existing evidence already names.
 */
const DEFAULT_BAND = 0.3;

const measureExpression = (targets, band) => String.raw`(async () => {
  const TARGETS = ${JSON.stringify(targets)};
  const RASTER = ${RASTER};
  const BAND = ${band};
  const round = (value, digits = 4) => {
    if (!Number.isFinite(value)) return null;
    const result = Number(value.toFixed(digits));
    return Object.is(result, -0) ? 0 : result;
  };

  const runtime = window.island;
  if (!runtime || !runtime.ready) return { error: "the reference runtime is not ready" };

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
  if (byOwner.size === 0) return { error: "none of the requested meshes were found" };

  const rows = [];
  for (const [semanticId, meshes] of byOwner) {
    const triangles = [];
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const mesh of meshes) {
      mesh.updateMatrixWorld(true);
      const position = mesh.geometry?.getAttribute("position");
      if (!position) continue;
      const index = mesh.geometry.getIndex();
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
    const centre = [(min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2];
    const half = [Math.max(1e-6, extent[0] / 2), 0, Math.max(1e-6, extent[2] / 2)];
    const ceiling = min[1] + extent[1] * BAND;

    // The band's occupancy, its area, and its area-weighted reach. Reach is
    // normalised by each axis's own half-extent and taken as a Chebyshev radius,
    // which is exactly what measure-architecture-massing.mjs reports, so the two
    // files describe the same quantity.
    const occupancy = new Uint8Array(RASTER * RASTER);
    let totalArea = 0;
    let bandArea = 0;
    let bandReach = 0;
    let bandTriangles = 0;
    for (const [a, b, c] of triangles) {
      const cross = [
        (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
        (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
      ];
      const triangleArea = 0.5 * Math.hypot(cross[0], cross[1], cross[2]);
      totalArea += triangleArea;
      if ((a[1] + b[1] + c[1]) / 3 > ceiling) continue;
      bandArea += triangleArea;
      bandTriangles += 1;
      const u = ((a[0] + b[0] + c[0]) / 3 - centre[0]) / half[0];
      const w = ((a[2] + b[2] + c[2]) / 3 - centre[2]) / half[2];
      bandReach += triangleArea * Math.max(Math.abs(u), Math.abs(w));

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
        for (let u2 = lowU; u2 <= highU; u2 += 1) {
          if (occupancy[v * RASTER + u2]) continue;
          const px = u2 + 0.5;
          const pz = v + 0.5;
          if (Math.abs(denominator) < 1e-12) {
            occupancy[v * RASTER + u2] = 1;
            continue;
          }
          const w0 = ((pb[1] - pc[1]) * (px - pc[0]) + (pc[0] - pb[0]) * (pz - pc[1])) / denominator;
          const w1 = ((pc[1] - pa[1]) * (px - pc[0]) + (pa[0] - pc[0]) * (pz - pc[1])) / denominator;
          const w2 = 1 - w0 - w1;
          if (w0 >= -0.02 && w1 >= -0.02 && w2 >= -0.02) occupancy[v * RASTER + u2] = 1;
        }
      }
    }

    let covered = 0;
    for (let cell = 0; cell < occupancy.length; cell += 1) covered += occupancy[cell];

    /**
     * 4-connected components of the band's footprint. This is the measurement the
     * radial profile cannot make: N uprights at radius r are N components and a
     * solid mass of radius r is one.
     */
    const label = new Int32Array(RASTER * RASTER).fill(-1);
    const components = [];
    const stack = [];
    for (let seed = 0; seed < occupancy.length; seed += 1) {
      if (!occupancy[seed] || label[seed] >= 0) continue;
      const id = components.length;
      label[seed] = id;
      stack.length = 0;
      stack.push(seed);
      let cells = 0;
      let sumU = 0;
      let sumV = 0;
      let maxReach = 0;
      while (stack.length > 0) {
        const cell = stack.pop();
        const u = cell % RASTER;
        const v = (cell - u) / RASTER;
        cells += 1;
        sumU += u + 0.5;
        sumV += v + 0.5;
        const ru = Math.abs((u + 0.5) / RASTER - 0.5) * 2;
        const rv = Math.abs((v + 0.5) / RASTER - 0.5) * 2;
        const reach = Math.max(ru, rv);
        if (reach > maxReach) maxReach = reach;
        const push = (nu, nv) => {
          if (nu < 0 || nv < 0 || nu >= RASTER || nv >= RASTER) return;
          const next = nv * RASTER + nu;
          if (!occupancy[next] || label[next] >= 0) return;
          label[next] = id;
          stack.push(next);
        };
        push(u - 1, v);
        push(u + 1, v);
        push(u, v - 1);
        push(u, v + 1);
      }
      const cu = sumU / cells / RASTER - 0.5;
      const cv = sumV / cells / RASTER - 0.5;
      components.push({
        cells,
        occupancyShare: round(cells / Math.max(1, covered), 4),
        centre: [round(cu, 3), round(cv, 3)],
        // The component's own centroid radius, doubled onto the box's own scale so
        // 1.0 is the wall — the same normalisation as reach.
        centroidReach: round(Math.max(Math.abs(cu), Math.abs(cv)) * 2, 3),
        outerReach: round(maxReach, 3),
      });
    }
    components.sort((left, right) => right.cells - left.cells);

    /**
     * A coarse picture of the occupancy, so a human can look at the shape instead of
     * inferring it from a decomposition. Both village reverts in this milestone designed a
     * form from summary statistics of a footprint nobody had looked at: the bridge's band
     * was derived from the axis between the two largest rectangles of a *greedy*
     * axis-aligned cover, and a greedy cover of almost any blob yields two large offset
     * rectangles whose centres define some axis.
     */
    const MAP = 24;
    const map = [];
    for (let row = 0; row < MAP; row += 1) {
      let line = "";
      for (let column = 0; column < MAP; column += 1) {
        let filled = 0;
        let cells = 0;
        for (let v = Math.floor((row * RASTER) / MAP); v < Math.floor(((row + 1) * RASTER) / MAP); v += 1) {
          for (let u = Math.floor((column * RASTER) / MAP); u < Math.floor(((column + 1) * RASTER) / MAP); u += 1) {
            cells += 1;
            filled += occupancy[v * RASTER + u];
          }
        }
        const share = cells > 0 ? filled / cells : 0;
        line += share > 0.66 ? "#" : share > 0.33 ? "+" : share > 0 ? "." : " ";
      }
      map.push(line);
    }

    rows.push({
      semanticId,
      meshes: meshes.length,
      occupancyMap: map,
      triangles: triangles.length,
      extent: extent.map((value) => round(value, 2)),
      band: BAND,
      bandTriangles,
      areaShare: round(bandArea / Math.max(1e-9, totalArea), 4),
      reach: round(bandReach / Math.max(1e-9, bandArea), 4),
      coverage: round(covered / (RASTER * RASTER), 4),
      components: components.length,
      // Bounded: a long tail of single-cell specks is not a structural claim.
      largest: components.filter((entry) => entry.cells >= 4).slice(0, 12),
      specks: components.filter((entry) => entry.cells < 4).length,
    });
  }

  return { raster: RASTER, band: BAND, requested: TARGETS.length, placements: rows };
})()`;

const PROBE_EXPRESSION = `(() => {
  const inventory = window.sceneInventory;
  return {
    state: inventory?.status === "error" ? "error" : null,
    status: inventory?.status ?? null,
    statusText: inventory?.error ?? null,
  };
})()`;

function summarise(kind, rows) {
  const mean = (pick) => rows.reduce((sum, row) => sum + pick(row), 0) / rows.length;
  const counts = rows.map((row) => row.largest.length);
  return {
    kind,
    placements: rows.length,
    areaShare: Number(mean((row) => row.areaShare).toFixed(4)),
    reach: Number(mean((row) => row.reach).toFixed(4)),
    coverage: Number(mean((row) => row.coverage).toFixed(4)),
    componentsPerPlacement: counts,
    componentsMedian: counts.slice().sort((a, b) => a - b)[Math.floor(counts.length / 2)],
    outerComponentReach: Number(
      mean((row) =>
        row.largest.length > 0
          ? Math.max(...row.largest.map((entry) => entry.centroidReach))
          : 0,
      ).toFixed(4),
    ),
  };
}

async function main() {
  const kinds = flag("--kinds")?.split(",").map((value) => value.trim()) ?? DEFAULT_KINDS;
  const band = Number(flag("--band") ?? DEFAULT_BAND);

  if (checkOnly) {
    const recorded = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
    assert.equal(recorded.schemaVersion, SCHEMA_VERSION);
    assert.ok(recorded.kinds.length > 0, "no kinds recorded");
    for (const row of recorded.kinds) {
      assert.ok(
        row.reach > 0 && row.reach <= 1,
        `${row.kind} has an impossible band reach`,
      );
      assert.ok(
        row.componentsMedian >= 1,
        `${row.kind} recorded no ground-structure components`,
      );
    }
    console.log(
      `Ground structure: unchanged — ` +
        recorded.kinds
          .map((row) => `${row.kind} ${row.componentsMedian} components at reach ${row.reach}`)
          .join(", "),
    );
    return;
  }

  const inventory = JSON.parse(
    await readFile(
      path.join(PROJECT_ROOT, ".scratch/scene-parity-foundation/evidence/scene-inventory-v1.json"),
      "utf8",
    ),
  );
  const horizon = JSON.parse(
    await readFile(
      path.join(PROJECT_ROOT, ".scratch/scene-parity-foundation/evidence/horizon-reference-v1.json"),
      "utf8",
    ),
  );
  const { placements, members } = readAuthoredPlacements(inventory, horizon);
  const byKey = new Map();
  for (const [meshPath, key] of members) {
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(meshPath);
  }
  const known = new Set(placements.map((placement) => placement.kind));
  const unmatched = kinds.filter((kind) => !known.has(kind));
  if (unmatched.length > 0) {
    throw new Error(
      `no placements of kind ${unmatched.join(", ")}; known kinds: ` +
        [...known].sort().join(", "),
    );
  }
  const targets = placements
    .filter((placement) => kinds.includes(placement.kind))
    .map((placement) => ({
      semanticId: placement.semanticId,
      kind: placement.kind,
      paths: byKey.get(placement.key) ?? [],
    }));

  const run = await runLocalSceneAutomation({
    label: "ground-structure",
    serverFlag: "--scene-inventory",
    path: "/scene-inventory.html",
    query: `?${new URLSearchParams(contract.reference.urlOptions).toString()}`,
    readyState: { status: "ready" },
    timeoutMs: 300_000,
    port: 8503,
    probeExpression: PROBE_EXPRESSION,
    preloadScript: createFrozenObservationClockPreload(contract.clock),
    viewport: {
      width: contract.capture.cssViewport[0],
      height: contract.capture.cssViewport[1],
      deviceScaleFactor: contract.capture.deviceScaleFactor,
    },
    blockExternalNetwork: false,
    allowedExternalRequestUrls: [contract.renderContract.ocean.normalMapUrl],
    postReadyExpression: measureExpression(targets, band),
  });
  assert.equal(run.state?.error, undefined, run.state?.error);
  const rows = run.state?.placements ?? [];
  assert.equal(
    rows.length,
    targets.length,
    `asked for ${targets.length} placements and measured ${rows.length}`,
  );
  const kindOf = new Map(targets.map((target) => [target.semanticId, target.kind]));
  for (const row of rows) row.kind = kindOf.get(row.semanticId);

  const summarised = kinds
    .map((kind) => rows.filter((row) => row.kind === kind))
    .filter((group) => group.length > 0)
    .map((group) => summarise(group[0].kind, group));

  const evidence = {
    schemaVersion: SCHEMA_VERSION,
    authority: contract.authority,
    subject: "the lower band of the Assembled Authored Scene's structural trees",
    measuredAt: new Date().toISOString(),
    raster: run.state.raster,
    band: run.state.band,
    note:
      "Connected components of the horizontal projection of the geometry inside the " +
      "bottom BAND of each placement's own height, by triangle scan-conversion. Ticket " +
      "07 records the upright count as unrecoverable from a radially averaged profile, " +
      "which is true of that profile: a radial mean cannot separate N posts at radius r " +
      "from a solid cylinder of radius r. A banded scan conversion can, because one is N " +
      "blobs and the other is a disc. reach and areaShare use the same normalisation as " +
      "axial-massing-v1.json so a form built to this file is built to numbers both read.",
    kinds: summarised,
    placements: rows,
  };

  await mkdir(path.dirname(EVIDENCE_PATH), { recursive: true });
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(`Ground structure: band ${band}, ${rows.length} placements\n`);
  console.log("kind         n  areaShare  reach  coverage  components        outer");
  for (const row of summarised) {
    console.log(
      row.kind.padEnd(12),
      String(row.placements).padStart(1),
      String(row.areaShare).padStart(10),
      String(row.reach).padStart(6),
      String(row.coverage).padStart(9),
      JSON.stringify(row.componentsPerPlacement).padStart(17),
      String(row.outerComponentReach).padStart(6),
    );
  }
  for (const row of rows) {
    console.log(
      `\n  ${row.semanticId}  (${row.kind}, ${row.triangles} tri, band ${row.bandTriangles} tri, ` +
        `${row.components} components, ${row.specks} specks)`,
    );
    if (row.occupancyMap) {
      for (const line of row.occupancyMap) console.log(`    |${line}|`);
    }
    for (const entry of row.largest) {
      console.log(
        `    cells ${String(entry.cells).padStart(4)}  centre ${JSON.stringify(entry.centre)}` +
          `  centroidReach ${entry.centroidReach}  outerReach ${entry.outerReach}` +
          `  share ${entry.occupancyShare}`,
      );
    }
  }
  console.log(`\nWrote ${path.relative(PROJECT_ROOT, EVIDENCE_PATH)}`);
}

await main();
