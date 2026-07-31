import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { generateSceneObject } from "../gt_designer/src/reconstruction/scene/scene-object-generators.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) =>
  readFile(path.join(PROJECT_ROOT, relative), "utf8").then(JSON.parse);

const [massing, correspondence, ground] = await Promise.all([
  read(".scratch/full-island-reconstruction/evidence/axial-massing-v1.json"),
  read(".scratch/scene-parity-foundation/evidence/scene-correspondence-v1.json"),
  read(".scratch/full-island-reconstruction/evidence/ground-structure-v1.json"),
]);

const KINDS = ["pavilion", "pavilion-single"];

/** Recorded when the pavilions became revolved surfaces. Regression guards, not gates. */
const RECORDED = Object.freeze({
  pavilion: { before: 18.641, after: 16.2 },
  "pavilion-single": { before: 17.6658, after: 17.0 },
});

function measured(kind) {
  const row = massing.kinds.find((entry) => entry.kind === kind);
  assert.ok(row, `${kind} is not in the axial massing evidence`);
  return row;
}

test("both pavilions taper, and the candidate tapers with them", () => {
  /**
   * The `architecture` family built these as a wide plinth under a hollow body under a
   * four-sided cone. Measured, both authored pavilions are the other shape: widest at the
   * base — 0.70 and 0.72 — and narrowest at the crown, 0.15 and 0.21, with 32.3 and 41.7
   * per cent of their area in the base decile alone.
   *
   * Both profiles come from `measure-architecture-massing.mjs`, which puts the two
   * subjects through one sampler. This reads that comparison rather than recomputing it,
   * for the reason ADR-0055 and ADR-0060 both record.
   */
  for (const kind of KINDS) {
    const { authored, candidate } = measured(kind);
    const base = (row) => row.reach.slice(0, 2).filter((value) => value !== null);
    const crown = (row) => row.reach.slice(-2).filter((value) => value !== null);
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

    assert.ok(
      mean(base(authored)) > mean(crown(authored)),
      `${kind}'s authored profile does not taper, so this check is measuring the wrong thing`,
    );
    assert.ok(
      mean(base(candidate)) > mean(crown(candidate)),
      `${kind} is built widest at the crown: base ${mean(base(candidate)).toFixed(2)} ` +
        `against crown ${mean(crown(candidate)).toFixed(2)}`,
    );
    // And by a comparable amount, so "tapers" cannot be satisfied by a needle.
    const authoredDrop = mean(base(authored)) - mean(crown(authored));
    const candidateDrop = mean(base(candidate)) - mean(crown(candidate));
    assert.ok(
      candidateDrop > authoredDrop * 0.4 && candidateDrop < authoredDrop * 2.2,
      `${kind} taper is ${candidateDrop.toFixed(3)} against an authored ${authoredDrop.toFixed(3)}`,
    );
  }
});

test("a pavilion is one revolved surface with a bounded plan", () => {
  for (const kind of KINDS) {
    const form = generateSceneObject(kind, 13);
    let meshes = 0;
    let triangles = 0;
    form.traverse((child) => {
      if (!child.isMesh) return;
      meshes += 1;
      const position = child.geometry.attributes.position;
      const index = child.geometry.index;
      triangles += Math.floor((index ? index.count : position.count) / 3);
    });
    // One surface, not a plinth-body-cone stack: the reverted architecture attempt matched
    // its massing profile and raised group contour distance a fifth by adding seams. The
    // authored pavilions are one mesh each, so one part is the faithful count.
    assert.equal(meshes, 1, `${kind} emits ${meshes} meshes`);
    assert.ok(triangles > 100 && triangles < 600, `${kind} has ${triangles} triangles`);

    form.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(form);
    const centre = bounds.getCenter(new THREE.Vector3());
    assert.ok(Math.abs(centre.x) <= 1e-5 && Math.abs(centre.z) <= 1e-5);
    assert.ok(Math.abs(bounds.min.y) <= 1e-5);

    const again = new THREE.Box3().setFromObject(generateSceneObject(kind, 13));
    assert.deepEqual(
      again.getSize(new THREE.Vector3()).toArray(),
      bounds.getSize(new THREE.Vector3()).toArray(),
      `${kind} is not deterministic`,
    );
  }
});

test("the eight-sided plan is a declared compromise between two measured coverages", () => {
  /**
   * Named rather than smoothed. Scan conversion puts the authored footprints at 0.6152 and
   * 0.8458 of their own rectangles, against 0.5 for a diamond, 0.707 for a regular octagon
   * and 1.0 for an aligned square. Eight sides is the closest single family value to both,
   * and choosing a different count for each — from one placement each — would be fitting
   * to a sample of one. This asserts the measurement still straddles the octagon, so if a
   * re-measurement ever moves both to the same side the compromise stops being one.
   */
  const coverage = new Map(
    ground.placements
      .filter((row) => KINDS.includes(row.kind))
      .map((row) => [row.kind, row.coverage]),
  );
  const octagon = 0.707;
  assert.equal(coverage.size, 2, "the pavilions' footprints have not been measured");
  assert.ok(
    coverage.get("pavilion") < octagon,
    `pavilion coverage ${coverage.get("pavilion")} is no longer under the octagon`,
  );
  assert.ok(
    coverage.get("pavilion-single") > octagon,
    `pavilion-single coverage ${coverage.get("pavilion-single")} is no longer over the octagon`,
  );
});

test("the measured pavilion result has not regressed", () => {
  for (const kind of KINDS) {
    const recorded = RECORDED[kind];
    const value = correspondence.surface.byKind[kind].mean;
    assert.ok(
      value <= recorded.after,
      `${kind} surface p95 ${value} regressed past ${recorded.after}`,
    );
    assert.ok(
      recorded.after < recorded.before,
      `${kind}'s recorded result is not an improvement on ${recorded.before}`,
    );
  }
});
