import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";

import {
  compressStoneProfile,
  createStoneStructuralSubstitute,
  createStoneSupportHull,
  quantizeRadialResolution,
  removeMeaningfulComponent,
  removeMeaningfulComponentFamily,
  shearStoneGeometry,
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

test("component-family deletion removes a significant non-dominant area", () => {
  const parts = [0, 3, 6].map((offset) => {
    const part = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    part.translate(offset, 0, 0);
    return part;
  });
  const values = new Float32Array(
    parts.reduce(
      (sum, part) => sum + part.getAttribute("position").array.length,
      0,
    ),
  );
  let offset = 0;
  for (const part of parts) {
    values.set(part.getAttribute("position").array, offset);
    offset += part.getAttribute("position").array.length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(values, 3));
  const result = removeMeaningfulComponentFamily(geometry, 0.2);
  assert.equal(result.metadata.sourceComponentCount, 3);
  assert.equal(result.metadata.removedComponentCount, 1);
  assert.ok(result.metadata.removedSurfaceAreaFraction >= 0.2);
  assert.equal(result.metadata.removedTriangleCount, 12);
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

test("Stone support controls produce bounded hulls at every declared count", () => {
  const source = new THREE.SphereGeometry(2, 24, 12);
  source.scale(1, 0.6, 0.8);
  for (const directionCount of [8, 12, 16, 24]) {
    const result = createStoneSupportHull(source, directionCount);
    assert.ok(result.getAttribute("position").count >= 4);
    assert.ok(result.index.count >= 12);
    assert.ok(result.boundingBox.min.y <= -1.19);
    assert.ok(result.boundingBox.max.y >= 1.19);
  }
});

test("Stone profile, shear, and substitute controls preserve valid geometry", () => {
  const source = new THREE.SphereGeometry(1, 8, 8);
  source.scale(1, 2, 1.5);
  const compressed = compressStoneProfile(source, 0.15);
  const sheared = shearStoneGeometry(source, 0.12);
  const ellipsoid = createStoneStructuralSubstitute(source, "ellipsoid");
  const box = createStoneStructuralSubstitute(source, "box");
  for (const geometry of [compressed, sheared, ellipsoid, box]) {
    assert.ok(geometry.getAttribute("position").count > 0);
    assert.ok(geometry.boundingBox.max.y > geometry.boundingBox.min.y);
  }
  assert.notDeepEqual(
    compressed.getAttribute("position").array,
    source.getAttribute("position").array,
  );
  assert.notDeepEqual(
    sheared.getAttribute("position").array,
    source.getAttribute("position").array,
  );
});
