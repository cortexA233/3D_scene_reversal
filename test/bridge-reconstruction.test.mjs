import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { generateSceneObject } from "../gt_designer/src/reconstruction/scene/scene-object-generators.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) =>
  readFile(path.join(PROJECT_ROOT, relative), "utf8").then(JSON.parse);

const [passes, correspondence, plate] = await Promise.all([
  read(".scratch/scene-parity-foundation/evidence/scene-passes-v1.json"),
  read(".scratch/scene-parity-foundation/evidence/scene-correspondence-v1.json"),
  read(".scratch/full-island-reconstruction/evidence/plate-footprint-v1.json"),
]);

const BRIDGES = ISLAND_SCENE_RECIPE.entities.filter((entity) => entity.kind === "bridge");

/** Recorded when the deck band landed. Regression guards, not calibrated gates. */
const RECORDED = Object.freeze({
  groupIoU: { before: 0.3624, after: 0.55 },
  groupContourP95: { before: 20.49, after: 11 },
  pixelRatio: { before: 2.22, after: 1.5 },
  surfaceP95: { before: 15.8742, after: 13 },
});

function bridgeGroupRows() {
  const rows = { iou: 0, contour: 0, reference: 0, candidate: 0, n: 0 };
  for (const view of passes.views) {
    const group = view.byGroup?.bridges;
    if (!group) continue;
    rows.n += 1;
    rows.iou += group.intersectionOverUnion ?? 0;
    rows.contour += group.contourDistance?.p95 ?? 0;
    rows.reference += group.referencePixels ?? 0;
    rows.candidate += group.candidatePixels ?? 0;
  }
  return rows;
}

test("both bridges carry the four measured controls and nothing else", () => {
  assert.equal(BRIDGES.length, 2);
  const assets = new Map();
  for (const asset of plate.assets) {
    if (asset.kind !== "bridge") continue;
    for (const semanticId of asset.placements) assets.set(semanticId, asset);
  }
  for (const entity of BRIDGES) {
    assert.deepEqual(
      Object.keys(entity.shape).sort(),
      ["deckAxis", "deckHeight", "footprintCoverage", "subDeckShare"],
      `${entity.semanticId} carries something other than the four measured controls`,
    );
    // Every one is recomputed from the measurement rather than trusted, so a hand-tuned
    // value cannot arrive wearing a measured name.
    const asset = assets.get(entity.semanticId);
    assert.ok(asset, `${entity.semanticId} has no plate measurement`);
    const profile = asset.verticalAreaProfile;
    const total = profile.reduce((sum, value) => sum + value, 0);
    const deckHeight =
      profile.reduce((sum, value, decile) => sum + value * ((decile + 0.5) / profile.length), 0) /
      total;
    const [first, second] = asset.rectangles;
    const axis = Math.atan2(
      second.centre[1] - first.centre[1],
      second.centre[0] - first.centre[0],
    );
    const subDeck =
      profile.slice(0, Math.floor(profile.length / 2)).reduce((sum, value) => sum + value, 0) /
      total;
    assert.ok(Math.abs(entity.shape.deckHeight - deckHeight) < 5e-4);
    assert.ok(Math.abs(entity.shape.deckAxis - axis) < 5e-4);
    assert.ok(Math.abs(entity.shape.subDeckShare - subDeck) < 5e-4);
    assert.equal(entity.shape.footprintCoverage, Number(asset.coverage.toFixed(4)));
  }
  // The two run along *opposite* diagonals, which is the fact a centred plate cannot
  // express and the reason this control exists at all.
  const [left, right] = BRIDGES.map((entity) => (entity.shape.deckAxis * 180) / Math.PI);
  assert.ok(
    Math.abs(Math.abs(left - right) - 180) > 20,
    `the two bridges' axes ${left.toFixed(1)} and ${right.toFixed(1)} are the same line`,
  );
});

test("the built deck runs along its measured axis, not the mirror of it", () => {
  /**
   * The defect that made the first band attempt score *below* what uncorrelated placement
   * of the same area would score. `ExtrudeGeometry` builds in the shape's XY plane and
   * `rotateX(-PI/2)` sends shape-Y to world -Z, so feeding a footprint's z straight into
   * the shape's Y mirrors the plan — which turns +136.1 degrees into -136.1, the other
   * bridge's diagonal. The two axes here are almost exactly each other's mirror, so this
   * scene is the worst possible place for that bug to hide.
   *
   * A narrow band is used because the estimator needs it: at the real coverages the
   * clipped hexagon nearly fills the square and its principal axis is ill-conditioned.
   */
  const normalise = (degrees) => {
    let value = degrees % 180;
    if (value < -90) value += 180;
    if (value > 90) value -= 180;
    return value;
  };
  for (const entity of BRIDGES) {
    const form = generateSceneObject("bridge", 7, { ...entity.shape, footprintCoverage: 0.12 });
    form.updateMatrixWorld(true);
    let sxx = 0;
    let szz = 0;
    let sxz = 0;
    const vertex = new THREE.Vector3();
    form.traverse((child) => {
      if (!child.isMesh || child.userData.semanticPart !== "deck") return;
      const position = child.geometry.attributes.position;
      for (let index = 0; index < position.count; index += 1) {
        vertex.fromBufferAttribute(position, index).applyMatrix4(child.matrixWorld);
        sxx += vertex.x * vertex.x;
        szz += vertex.z * vertex.z;
        sxz += vertex.x * vertex.z;
      }
    });
    const built = normalise((0.5 * Math.atan2(2 * sxz, sxx - szz) * 180) / Math.PI);
    const intended = normalise((entity.shape.deckAxis * 180) / Math.PI);
    assert.ok(
      Math.abs(built - intended) < 5,
      `${entity.semanticId} deck runs at ${built.toFixed(1)} against a measured ${intended.toFixed(1)}`,
    );
  }
});

test("the deck reaches all four walls and covers its measured fraction", () => {
  // `placeEntity` scales the generated AABB onto the Target AABB Extent exactly, so a band
  // that does not reach the walls is stretched until it does — which would move it off the
  // measured axis and change the coverage the width was solved from.
  for (const entity of BRIDGES) {
    const form = generateSceneObject("bridge", 7, entity.shape);
    const size = form.userData.localSize;
    // A few parts in a thousand, not exact: the railings are inset by their own width
    // along the deck's edge normals and can round a hair past the corner. What this has
    // to catch is a band that misses a wall by tens of per cent and gets stretched onto
    // it, which is the failure that would move the deck off its measured axis.
    assert.ok(
      Math.abs(size[0] - 1) < 5e-3 && Math.abs(size[2] - 1) < 5e-3,
      `${entity.semanticId} local footprint is ${size[0].toFixed(3)} by ${size[2].toFixed(3)}`,
    );
  }
});

test("the bridge form is deterministic and locally framed", () => {
  for (const entity of BRIDGES) {
    const box = (seed) => {
      const form = generateSceneObject("bridge", seed, entity.shape);
      form.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(form);
    };
    const first = box(11);
    assert.deepEqual(
      box(11).getSize(new THREE.Vector3()).toArray(),
      first.getSize(new THREE.Vector3()).toArray(),
    );
    const centre = first.getCenter(new THREE.Vector3());
    assert.ok(Math.abs(centre.x) <= 1e-5 && Math.abs(centre.z) <= 1e-5);
    assert.ok(Math.abs(first.min.y) <= 1e-5);
  }
});

test("the measured bridge result has not regressed", () => {
  const rows = bridgeGroupRows();
  assert.ok(rows.n > 0, "no bridge rows in the pass evidence");
  const iou = rows.iou / rows.n;
  const contour = rows.contour / rows.n;
  const ratio = rows.candidate / rows.reference;

  assert.ok(
    iou >= RECORDED.groupIoU.after,
    `bridges silhouette IoU ${iou.toFixed(4)} regressed past ${RECORDED.groupIoU.after}`,
  );
  assert.ok(
    contour <= RECORDED.groupContourP95.after,
    `bridges contour p95 ${contour.toFixed(2)} regressed past ${RECORDED.groupContourP95.after}`,
  );
  assert.ok(
    ratio <= RECORDED.pixelRatio.after,
    `bridges pixel ratio ${ratio.toFixed(2)} regressed past ${RECORDED.pixelRatio.after}`,
  );
  assert.ok(
    correspondence.surface.byKind.bridge.mean <= RECORDED.surfaceP95.after,
    `bridge surface p95 ${correspondence.surface.byKind.bridge.mean} regressed`,
  );
  // Each guard has to be an improvement on what the centred plate scored, or it is not a
  // guard — it is a record of standing still.
  for (const [name, entry] of Object.entries(RECORDED)) {
    const improved = name === "groupIoU" ? entry.after > entry.before : entry.after < entry.before;
    assert.ok(improved, `${name}'s recorded result is not an improvement on ${entry.before}`);
  }
});
