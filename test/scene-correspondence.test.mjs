import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { generateScene } from "../gt_designer/src/reconstruction/scene/scene-generator.js";
import {
  observeAuthoredReference,
  observeCandidate,
} from "../tools/evaluation/scene-observation.mjs";
import {
  compareScenes,
  orientationError,
} from "../tools/evaluation/scene-correspondence.mjs";
import { surfaceDistance } from "../tools/evaluation/surface-sampling.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const EVIDENCE = path.join(PROJECT_ROOT, ".scratch/scene-parity-foundation/evidence");

const [inventory, samples] = await Promise.all([
  readFile(path.join(EVIDENCE, "scene-inventory-v1.json"), "utf8").then(JSON.parse),
  readFile(path.join(EVIDENCE, "scene-surface-samples-v1.json"), "utf8").then(JSON.parse),
]);

const reference = observeAuthoredReference({ inventory, samples });
const candidate = observeCandidate(generateScene(ISLAND_SCENE_RECIPE));

function entityObservation(rows) {
  return {
    schemaVersion: "scene-observation-v1",
    subject: "fixture",
    entities: new Map(rows.map((row) => [row.semanticId, row])),
    covers: new Map(),
    lights: [],
    adapterIntegrity: { transientCorrection: false, corrections: [] },
  };
}

/** A unit cube's surface, sampled on a regular lattice for exact expectations. */
function cubeSamples(centre, size) {
  const points = [];
  const half = size / 2;
  for (const axis of [0, 1, 2]) {
    for (const sign of [-1, 1]) {
      for (let u = -1; u <= 1; u += 0.5) {
        for (let v = -1; v <= 1; v += 0.5) {
          const point = [0, 0, 0];
          point[axis] = sign * half;
          point[(axis + 1) % 3] = u * half;
          point[(axis + 2) % 3] = v * half;
          points.push(
            centre[0] + point[0],
            centre[1] + point[1],
            centre[2] + point[2],
          );
        }
      }
    }
  }
  return points;
}

test("bidirectional surface distance matches an analytical translation", () => {
  const left = cubeSamples([0, 0, 0], 10);
  const right = cubeSamples([3, 0, 0], 10);
  const identical = surfaceDistance(left, left, 1);

  assert.equal(identical.symmetric.rmse, 0);
  assert.equal(identical.symmetric.max, 0);
  assert.equal(identical.symmetric.overToleranceFraction, 0);

  const translated = surfaceDistance(left, right, 1);
  assert.ok(translated.symmetric.max >= 2.9 && translated.symmetric.max <= 3.1);
  assert.ok(translated.symmetric.overToleranceFraction > 0.2);
  assert.ok(translated.referenceToCandidate.count === left.length / 3);
  assert.ok(translated.candidateToReference.count === right.length / 3);
});

test("one-sided coverage is reported in both directions", () => {
  // The candidate covers the reference exactly but also adds a distant slab,
  // which a one-way average would hide.
  const referenceCube = cubeSamples([0, 0, 0], 10);
  const bulky = [...referenceCube, ...cubeSamples([40, 0, 0], 10)];
  const result = surfaceDistance(referenceCube, bulky, 1);

  assert.equal(result.referenceToCandidate.max, 0);
  assert.ok(result.candidateToReference.max > 30);
});

test("orientation error respects the declared equivalence", () => {
  assert.equal(orientationError({ type: "radial" }, { type: "radial" }).error, 0);
  assert.equal(
    orientationError(
      { type: "axis", radians: 0.1 },
      { type: "axis", radians: 0.1 + Math.PI },
    ).error,
    0,
  );
  assert.ok(
    Math.abs(
      orientationError(
        { type: "heading", radians: 0.1 },
        { type: "heading", radians: 0.1 + Math.PI },
      ).error - Math.PI,
    ) < 1e-9,
  );
  assert.equal(
    orientationError({ type: "heading", radians: 0 }, { type: "axis", radians: 0 }).type,
    "mismatch",
  );
});

test("structural damage blocks before any geometry result can help", () => {
  const rows = [
    {
      semanticId: "structures/pavilion-p0000-p0000-p0000",
      kind: "pavilion",
      group: "structures",
      anchor: [0, 0, 0],
      extent: [10, 10, 10],
      orientation: { type: "heading", radians: 0 },
      componentCount: 3,
      triangles: 100,
      samples: cubeSamples([0, 5, 0], 10),
    },
    {
      semanticId: "rocks/rock-p0500-p0000-p0000",
      kind: "rock",
      group: "rocks",
      anchor: [50, 0, 0],
      extent: [6, 6, 6],
      orientation: { type: "axis", radians: 0 },
      componentCount: 1,
      triangles: 40,
      samples: cubeSamples([50, 3, 0], 6),
    },
  ];
  const identity = compareScenes(entityObservation(rows), entityObservation(rows));
  assert.equal(identity.structural.passed, true);
  assert.equal(identity.placement.anchorError.max, 0);
  assert.equal(identity.surface.rmse.max, 0);

  const deleted = compareScenes(
    entityObservation(rows),
    entityObservation(rows.slice(0, 1)),
  );
  assert.equal(deleted.structural.passed, false);
  assert.deepEqual(deleted.structural.missing, ["rocks/rock-p0500-p0000-p0000"]);

  const relabelled = compareScenes(
    entityObservation(rows),
    entityObservation([rows[0], { ...rows[1], kind: "palm", group: "vegetation" }]),
  );
  assert.equal(relabelled.structural.typeMismatch.length, 1);
});

test("layout damage separates a global shift from a local scramble", () => {
  const rows = Array.from({ length: 8 }, (_unused, index) => ({
    semanticId: `rocks/rock-p${String(index).padStart(4, "0")}-p0000-p0000`,
    kind: "rock",
    group: "rocks",
    anchor: [index * 20, 0, 0],
    extent: [6, 6, 6],
    orientation: { type: "axis", radians: 0 },
    componentCount: 1,
    triangles: 40,
    samples: cubeSamples([index * 20, 3, 0], 6),
  }));

  const shifted = compareScenes(
    entityObservation(rows),
    entityObservation(
      rows.map((row) => ({
        ...row,
        anchor: [row.anchor[0] + 25, row.anchor[1], row.anchor[2]],
        samples: cubeSamples([row.anchor[0] + 25, 3, 0], 6),
      })),
    ),
  );
  assert.ok(shifted.placement.anchorError.mean > 24);
  // A rigid shift preserves every relative distance and bearing.
  assert.equal(shifted.relational.distanceError.max, 0);
  assert.equal(shifted.relational.bearingError.max, 0);

  const scrambled = compareScenes(
    entityObservation(rows),
    entityObservation(
      rows.map((row, index) => ({
        ...row,
        anchor: [rows[(index * 3 + 1) % rows.length].anchor[0], 0, 0],
      })),
    ),
  );
  assert.ok(scrambled.relational.distanceError.max > 15);
});

test("a bounds-accurate single blob still fails the semantic structure check", () => {
  const reference = [
    {
      semanticId: "structures/pavilion-p0000-p0000-p0000",
      kind: "pavilion",
      group: "structures",
      anchor: [0, 0, 0],
      extent: [10, 10, 10],
      orientation: { type: "heading", radians: 0 },
      componentCount: 7,
      triangles: 900,
      samples: cubeSamples([0, 5, 0], 10),
    },
  ];
  const blob = compareScenes(
    entityObservation(reference),
    entityObservation([{ ...reference[0], componentCount: 1, triangles: 12 }]),
  );

  assert.equal(blob.placement.anchorError.max, 0);
  assert.equal(blob.placement.extentError.max, 0);
  assert.equal(blob.semanticStructure.componentDelta.max, 6);
  assert.equal(blob.semanticStructure.entitiesMissingComponents, 1);
});

test("the Candidate Adapter rejects a transient correction", () => {
  const generated = generateScene(ISLAND_SCENE_RECIPE);
  const clean = observeCandidate(generated);
  assert.equal(clean.adapterIntegrity.transientCorrection, false);
  assert.equal(clean.adapterIntegrity.rootTransformClean, true);

  // An adapter that translates the generated island to improve its score.
  generated.root.position.set(5, 0, -5);
  const fitted = observeCandidate(generated);
  assert.equal(fitted.adapterIntegrity.rootTransformClean, false);
  assert.equal(fitted.adapterIntegrity.transientCorrection, true);
  assert.equal(
    compareScenes(reference, fitted).adapterIntegrity.passed,
    false,
    "a fitted candidate observation must not be accepted as evidence",
  );
  generated.root.position.set(0, 0, 0);

  // An adapter that scales one entity to match its target extent.
  const [firstId] = ISLAND_SCENE_RECIPE.entities.map((entity) => entity.semanticId);
  const holder = generated.semanticIndex.get(firstId).object;
  holder.scale.set(1.2, 1.2, 1.2);
  assert.ok(
    observeCandidate(generated).adapterIntegrity.corrections.some((correction) =>
      correction.includes("scale"),
    ),
  );
  holder.scale.set(1, 1, 1);
});

test("the real candidate reproduces its placement contract and stays red on shape", () => {
  const report = compareScenes(reference, candidate, {
    sceneAnchor: ISLAND_SCENE_RECIPE.sceneAnchor,
  });

  assert.equal(report.adapterIntegrity.passed, true);
  assert.equal(report.structural.passed, true);
  assert.equal(report.placement.anchorError.max, 0);
  assert.equal(report.placement.extentRelative.max, 0);
  assert.equal(report.placement.orientationTypeMismatch, 0);
  assert.equal(report.relational.distanceError.max, 0);
  assert.equal(report.zones.delta.max, 0);
  assert.equal(report.overlapOrdering.rankError.max, 0);

  // The honest red baseline: exact layout, wrong surfaces and missing parts.
  assert.ok(
    report.surface.p95.mean > 1,
    "surface parity is not expected to pass during Foundation",
  );
  assert.ok(report.semanticStructure.componentDelta.mean > 0);
  assert.equal(report.distributedCover.unmatched, 0);
});

test("candidate observation reads the generated scene rather than the recipe", () => {
  const generated = generateScene(ISLAND_SCENE_RECIPE);
  const [firstId] = ISLAND_SCENE_RECIPE.entities.map((entity) => entity.semanticId);
  const holder = generated.semanticIndex.get(firstId).object;
  const before = observeCandidate(generated).entities.get(firstId).anchor;

  holder.children[0].position.x += 7;
  holder.updateMatrixWorld(true);
  const after = observeCandidate(generated).entities.get(firstId).anchor;

  assert.ok(
    Math.abs(after[0] - before[0]) > 6,
    "moving generated geometry must change the observed anchor",
  );
  assert.ok(new THREE.Vector3().fromArray(after).length() > 0);
});
