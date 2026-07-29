import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";

import {
  quantizeRadialResolution,
  removeMeaningfulComponent,
} from "../tools/evaluation/calibration-perturbations.mjs";
import {
  comparePointSets,
  evaluateGeometricDiagnostics,
} from "../tools/evaluation/geometric-diagnostics.mjs";

test("vertex-set Chamfer and Hausdorff diagnostics are analytically checkable", () => {
  const result = comparePointSets(
    [0, 0, 0, 2, 0, 0],
    [0, 0, 0, 4, 0, 0],
  );
  assert.equal(result.symmetricChamferMeanCanonical, 1);
  assert.equal(result.symmetricHausdorffCanonical, 2);
});

test("geometric diagnostics report valid area and volume for identical tetrahedra", () => {
  const positions = [
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ];
  const indices = [0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3];
  const result = evaluateGeometricDiagnostics({
    referencePositions: positions,
    referenceIndices: indices,
    replacementPositions: positions,
    replacementIndices: indices,
  });
  assert.equal(result.surfaceArea.relativeError, 0);
  assert.equal(result.volume.relativeError, 0);
  assert.equal(result.pointSetDistance.symmetricHausdorffCanonical, 0);
});

test("component deletion removes the largest non-dominant closed component", () => {
  const dominant = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
  const secondary = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  secondary.translate(5, 0, 0);
  const mergedPositions = new Float32Array(
    dominant.getAttribute("position").count * 3 +
      secondary.getAttribute("position").count * 3,
  );
  mergedPositions.set(dominant.getAttribute("position").array);
  mergedPositions.set(
    secondary.getAttribute("position").array,
    dominant.getAttribute("position").array.length,
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mergedPositions, 3));
  const result = removeMeaningfulComponent(geometry);
  assert.equal(result.metadata.sourceComponentCount, 2);
  assert.equal(result.metadata.removedTriangleCount, 12);
  assert.equal(result.metadata.retainedTriangleCount, 12);
  assert.equal(result.geometry.getAttribute("position").count, 36);
});

test("radial quantization uses only the requested angular sectors", () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([
      1, 0, 0,
      Math.SQRT1_2, 1, Math.SQRT1_2,
      0, 2, 1,
    ], 3),
  );
  geometry.setIndex([0, 1, 2]);
  const result = quantizeRadialResolution(geometry, 4);
  const position = result.getAttribute("position");
  assert.ok(Math.abs(position.getZ(1) - 1) < 1e-6);
  assert.ok(Math.abs(position.getX(1)) < 1e-6);
});
