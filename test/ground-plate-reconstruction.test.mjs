import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { generateSceneObject } from "../gt_designer/src/reconstruction/scene/scene-object-generators.js";
import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const authoredPlates = JSON.parse(
  await readFile(
    path.join(
      PROJECT_ROOT,
      ".scratch/full-island-reconstruction/evidence/plate-footprint-v1.json",
    ),
    "utf8",
  ),
);
const RASTER = 192;

/**
 * The generated plate's own footprint, measured the same way the reference's was:
 * the fraction of its bounding rectangle the geometry projects onto, and the mean
 * distance of that projection from the centre. The parts are axis-aligned boxes,
 * so each one's projection is exactly its own rectangle.
 */
function footprintOf(kind, shape) {
  const form = generateSceneObject(kind, 4242, shape);
  form.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(form);
  const size = bounds.getSize(new THREE.Vector3());
  const grid = new Uint8Array(RASTER * RASTER);
  form.traverse((child) => {
    if (!child.isMesh) return;
    const box = new THREE.Box3().setFromObject(child);
    const u0 = Math.round(((box.min.x - bounds.min.x) / size.x) * RASTER);
    const u1 = Math.round(((box.max.x - bounds.min.x) / size.x) * RASTER);
    const v0 = Math.round(((box.min.z - bounds.min.z) / size.z) * RASTER);
    const v1 = Math.round(((box.max.z - bounds.min.z) / size.z) * RASTER);
    for (let v = Math.max(0, v0); v < Math.min(RASTER, v1); v += 1) {
      for (let u = Math.max(0, u0); u < Math.min(RASTER, u1); u += 1) grid[v * RASTER + u] = 1;
    }
  });
  let covered = 0;
  let lateral = 0;
  for (let v = 0; v < RASTER; v += 1) {
    for (let u = 0; u < RASTER; u += 1) {
      if (!grid[v * RASTER + u]) continue;
      covered += 1;
      lateral +=
        Math.abs((u + 0.5) / RASTER - 0.5) + Math.abs((v + 0.5) / RASTER - 0.5);
    }
  }
  return {
    coverage: covered / (RASTER * RASTER),
    reach: covered === 0 ? 0 : lateral / covered,
    bounds,
    size,
  };
}

test("a plate covers the fraction of its rectangle it was measured to cover", () => {
  // The generator used to fill its box, which is why the plazas group drew 1.89
  // times the reference's pixels. Coverage below one is only reachable by a
  // concave form, because the Target AABB Extent is a hard output target.
  for (const coverage of [0.126, 0.191, 0.341, 0.568]) {
    const built = footprintOf("plaza", { footprintCoverage: coverage, perimeterShare: 0.22 });
    assert.ok(
      Math.abs(built.coverage - coverage) <= 0.03,
      `asked for coverage ${coverage} and built ${built.coverage.toFixed(3)}`,
    );
  }
});

test("full coverage degenerates to the filled plate one authored plaza actually is", () => {
  // One of the two authored plazas covers its whole rectangle and the other a
  // third of it. A program that cannot do both needs the kind split in two.
  const built = footprintOf("plaza", { footprintCoverage: 1, perimeterShare: 0 });
  assert.ok(built.coverage >= 0.999, `full coverage built ${built.coverage}`);
  assert.ok(
    Math.abs(built.reach - 0.5) < 0.01,
    `a filled square has reach 0.5, built ${built.reach.toFixed(3)}`,
  );
});

test("the perimeter share moves the plate's mass outward, which coverage cannot", () => {
  // Coverage alone cannot choose a shape: a walk and crossing paths of equal area
  // sit at opposite ends of the reach range, and that is the whole reason for the
  // second control.
  const paths = footprintOf("plaza", { footprintCoverage: 0.34, perimeterShare: 0 });
  const walk = footprintOf("plaza", { footprintCoverage: 0.34, perimeterShare: 1 });
  assert.ok(
    walk.reach > paths.reach + 0.2,
    `a walk reaches ${walk.reach.toFixed(3)} and paths ${paths.reach.toFixed(3)}; the controls are not separable`,
  );
  for (const share of [0, 0.25, 0.5, 0.75, 1]) {
    const built = footprintOf("plaza", { footprintCoverage: 0.34, perimeterShare: share });
    assert.ok(
      Math.abs(built.coverage - 0.34) <= 0.03,
      `share ${share} changed coverage to ${built.coverage.toFixed(3)}`,
    );
  }
});

test("a plate still fills its box exactly and names its parts as passages", () => {
  for (const shape of [
    { footprintCoverage: 1, perimeterShare: 0 },
    { footprintCoverage: 0.341, perimeterShare: 0.674 },
    { footprintCoverage: 0.126, perimeterShare: 0.236 },
  ]) {
    const built = footprintOf("deck", shape);
    // The extent contract is checked scene-wide, but a concave form is exactly
    // where a generator could quietly stop touching a wall.
    for (const axis of ["x", "z"]) {
      assert.ok(
        Math.abs(built.bounds.min[axis] + 0.5 * built.size[axis]) < 1e-6 &&
          Math.abs(built.bounds.max[axis] - 0.5 * built.size[axis]) < 1e-6,
        `the plate is not centred on ${axis}`,
      );
    }
    const form = generateSceneObject("deck", 7, shape);
    const ids = [];
    form.traverse((child) => {
      if (child.isMesh) ids.push(child.userData.semanticPart);
    });
    assert.equal(new Set(ids).size, ids.length, "plate part ids are not distinct");
    for (const id of ids) {
      assert.match(id, /^(path|walk)-/, `${id} is not a named passage`);
    }
  }
});

test("the recipe carries the measured controls for every plate entity", () => {
  const plateIds = new Set(
    authoredPlates.assets
      .filter((asset) => asset.kind === "plaza" || asset.kind === "deck")
      .flatMap((asset) => asset.placements),
  );
  assert.ok(plateIds.size >= 6, `only ${plateIds.size} authored plates were measured`);

  for (const entity of ISLAND_SCENE_RECIPE.entities) {
    if (entity.kind !== "plaza" && entity.kind !== "deck") continue;
    assert.ok(plateIds.has(entity.semanticId), `${entity.semanticId} was never measured`);
    const shape = entity.shape;
    assert.ok(shape, `${entity.semanticId} carries no plate controls`);
    assert.ok(
      shape.footprintCoverage > 0 && shape.footprintCoverage <= 1,
      `${entity.semanticId} has coverage ${shape.footprintCoverage}`,
    );
    assert.ok(
      shape.perimeterShare >= 0 && shape.perimeterShare <= 1,
      `${entity.semanticId} has share ${shape.perimeterShare}`,
    );
    // Two scalars, and no third thing: a per-entity form list is not a
    // reconstruction, and this is the boundary that keeps it two numbers.
    assert.deepEqual(
      Object.keys(shape).sort(),
      ["footprintCoverage", "perimeterShare"],
      `${entity.semanticId} carries more than the two measured controls`,
    );
  }
});

test("the generated plate reproduces each authored plate's measured coverage", () => {
  const byId = new Map();
  for (const asset of authoredPlates.assets) {
    for (const semanticId of asset.placements) byId.set(semanticId, asset);
  }
  for (const entity of ISLAND_SCENE_RECIPE.entities) {
    if (entity.kind !== "plaza" && entity.kind !== "deck") continue;
    const authored = byId.get(entity.semanticId);
    const built = footprintOf(entity.kind, entity.shape);
    assert.ok(
      Math.abs(built.coverage - authored.coverage) <= 0.03,
      `${entity.semanticId}: authored coverage ${authored.coverage}, built ${built.coverage.toFixed(3)}`,
    );
  }
});
