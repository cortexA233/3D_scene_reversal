import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateVisualEvidence,
  deltaE00,
  evaluateAppearanceView,
  evaluateGeometryView,
} from "../src/measurement/index.mjs";

/**
 * The package equivalents of the host repository's `visual-metrics.test.mjs`,
 * run against the vendored copy. The originals still run unchanged in the
 * repository; these exist so a copy that silently stopped behaving like the
 * original would fail here rather than in a fitting result.
 *
 * The repository's quality-gate cases are deliberately absent: object-specific
 * baseline evaluation stays there, and the package does not re-export it.
 */

function mask(width, height, foregroundPixels) {
  const pixels = new Uint8Array(width * height * 4);
  for (const [x, y] of foregroundPixels) {
    const offset = (y * width + x) * 4;
    pixels[offset] = 255;
    pixels[offset + 1] = 255;
    pixels[offset + 2] = 255;
    pixels[offset + 3] = 255;
  }
  return pixels;
}

function grayscale(values) {
  const pixels = new Uint8Array(values.length * 4);
  values.forEach((value, index) => {
    const byte = Math.round(value * 255);
    pixels.set([byte, byte, byte, 255], index * 4);
  });
  return pixels;
}

function solidColor(width, height, [red, green, blue]) {
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels.set([red, green, blue, 255], index * 4);
  }
  return pixels;
}

function colors(values) {
  const pixels = new Uint8Array(values.length * 4);
  values.forEach((value, index) => pixels.set([...value, 255], index * 4));
  return pixels;
}

test("geometry evidence is perfect for identical silhouettes and bounds", () => {
  const silhouette = mask(3, 3, [[1, 1]]);
  const result = evaluateGeometryView({
    width: 3,
    height: 3,
    referenceSilhouette: silhouette,
    replacementSilhouette: silhouette,
    referenceBounds: { min: [-1, 0, -2], max: [1, 3, 2] },
    replacementBounds: { min: [-1, 0, -2], max: [1, 3, 2] },
  });
  assert.equal(result.silhouette.iou, 1);
  assert.equal(result.silhouette.symmetricEdgeMeanPixels, 0);
  assert.equal(result.silhouette.symmetricEdgeP95Pixels, 0);
  assert.deepEqual(result.bounds.perAxisRelativeError, [0, 0, 0]);
  assert.equal(result.bounds.bottomAnchorErrorCanonical, 0);
});

test("geometry evidence detects a one-pixel silhouette shift", () => {
  const result = evaluateGeometryView({
    width: 3,
    height: 3,
    referenceSilhouette: mask(3, 3, [[1, 1]]),
    replacementSilhouette: mask(3, 3, [[2, 1]]),
    referenceBounds: { min: [-1, 0, -1], max: [1, 2, 1] },
    replacementBounds: { min: [-1, 0, -1], max: [1, 2, 1] },
  });
  assert.equal(result.silhouette.iou, 0);
  assert.equal(result.silhouette.symmetricEdgeMeanPixels, 1);
  assert.equal(result.silhouette.symmetricEdgeP95Pixels, 1);
});

test("missing silhouette is penalized with a finite frame-diagonal distance", () => {
  const result = evaluateGeometryView({
    width: 3,
    height: 3,
    referenceSilhouette: mask(3, 3, [[1, 1]]),
    replacementSilhouette: mask(3, 3, []),
    referenceBounds: { min: [-1, 0, -1], max: [1, 2, 1] },
    replacementBounds: { min: [0, 0, 0], max: [1, 1, 1] },
  });
  assert.equal(result.silhouette.iou, 0);
  assert.ok(Number.isFinite(result.silhouette.symmetricEdgeMeanPixels));
  assert.ok(
    Math.abs(result.silhouette.symmetricEdgeMeanPixels - Math.hypot(3, 3)) < 1e-12,
  );
});

test("depth evidence uses only silhouette intersection and declared percentiles", () => {
  const sharedMask = mask(3, 1, [
    [0, 0],
    [1, 0],
  ]);
  const result = evaluateGeometryView({
    width: 3,
    height: 1,
    referenceSilhouette: sharedMask,
    replacementSilhouette: sharedMask,
    referenceDepth: grayscale([0.2, 0.2, 0]),
    replacementDepth: grayscale([0.3, 0.4, 1]),
    referenceBounds: { min: [0, 0, 0], max: [1, 1, 1] },
    replacementBounds: { min: [0, 0, 0], max: [1, 1, 1] },
  });
  assert.ok(Math.abs(result.depth.mae - 0.15) < 0.005);
  assert.ok(Math.abs(result.depth.p95 - 0.2) < 0.005);
  assert.equal(result.depth.comparedPixels, 2);
});

test("world-normal evidence reports angular error on shared silhouette", () => {
  const sharedMask = mask(2, 1, [
    [0, 0],
    [1, 0],
  ]);
  const result = evaluateGeometryView({
    width: 2,
    height: 1,
    referenceSilhouette: sharedMask,
    replacementSilhouette: sharedMask,
    referenceWorldNormal: colors([
      [128, 128, 255],
      [128, 128, 255],
    ]),
    replacementWorldNormal: colors([
      [128, 128, 255],
      [128, 128, 0],
    ]),
    referenceBounds: { min: [0, 0, 0], max: [1, 1, 1] },
    replacementBounds: { min: [0, 0, 0], max: [1, 1, 1] },
  });
  assert.ok(Math.abs(result.worldNormal.meanDegrees - 90) < 1);
  assert.ok(Math.abs(result.worldNormal.p95Degrees - 180) < 1);
  assert.equal(result.worldNormal.comparedPixels, 2);
});

test("CIEDE2000 matches the published Sharma reference pair", () => {
  assert.ok(
    Math.abs(deltaE00([50, 2.6772, -79.7751], [50, 0, -82.7485]) - 2.0425) < 0.0001,
  );
});

test("identical appearance is perfect inside the two-pixel eroded mask", () => {
  const width = 5;
  const height = 5;
  const silhouette = mask(
    width,
    height,
    Array.from({ length: width * height }, (_, index) => [
      index % width,
      Math.floor(index / width),
    ]),
  );
  const color = solidColor(width, height, [180, 80, 40]);
  const result = evaluateAppearanceView({
    width,
    height,
    referenceSilhouette: silhouette,
    replacementSilhouette: silhouette,
    referenceAlbedo: color,
    replacementAlbedo: color,
    referenceLitRgb: color,
    replacementLitRgb: color,
    referenceMaterial: { roughness: 0.8, metalness: 0 },
    replacementMaterial: { roughness: 0.8, metalness: 0 },
  });
  assert.equal(result.comparedPixels, 1);
  assert.equal(result.albedo.meanDeltaE00, 0);
  assert.equal(result.albedo.maskedSsim, 1);
  assert.equal(result.palette.centroidDeltaE00, 0);
  assert.equal(result.material.roughnessAbsoluteError, 0);
});

test("appearance evidence detects a strong color mismatch", () => {
  const width = 5;
  const height = 5;
  const silhouette = solidColor(width, height, [255, 255, 255]);
  const result = evaluateAppearanceView({
    width,
    height,
    referenceSilhouette: silhouette,
    replacementSilhouette: silhouette,
    referenceAlbedo: solidColor(width, height, [255, 0, 0]),
    replacementAlbedo: solidColor(width, height, [0, 0, 255]),
    referenceLitRgb: solidColor(width, height, [255, 0, 0]),
    replacementLitRgb: solidColor(width, height, [0, 0, 255]),
    referenceMaterial: { roughness: 0.7, metalness: 0 },
    replacementMaterial: { roughness: 0.9, metalness: 0.1 },
  });
  assert.ok(result.albedo.meanDeltaE00 > 40);
  assert.ok(result.albedo.maskedSsim < 0.7);
  assert.ok(result.palette.centroidDeltaE00 > 40);
  assert.ok(Math.abs(result.material.roughnessAbsoluteError - 0.2) < 1e-12);
  assert.equal(result.material.metalnessAbsoluteError, 0.1);
});

function passingView(overrides = {}) {
  return {
    viewId: "low-000",
    geometry: {
      bounds: { maxAxisRelativeError: 0.01, bottomAnchorErrorCanonical: 0.01 },
      silhouette: {
        iou: 0.97,
        symmetricEdgeMeanPixels: 1,
        symmetricEdgeP95Pixels: 3,
      },
      depth: { mae: 0.01, p95: 0.03 },
      worldNormal: { meanDegrees: 2, p95Degrees: 5 },
    },
    appearance: {
      albedo: { meanDeltaE00: 2, p90DeltaE00: 5, maskedSsim: 0.97 },
      litRgb: { meanDeltaE00: 3, p90DeltaE00: 6, maskedSsim: 0.96 },
      palette: { centroidDeltaE00: 2, coverageL1: 0.04 },
      material: { roughnessAbsoluteError: 0.05, metalnessAbsoluteError: 0.02 },
    },
    ...overrides,
  };
}

test("view aggregation preserves means and worst-view evidence", () => {
  const first = passingView();
  const second = passingView({
    viewId: "low-045",
    geometry: {
      ...passingView().geometry,
      silhouette: {
        iou: 0.93,
        symmetricEdgeMeanPixels: 2,
        symmetricEdgeP95Pixels: 4,
      },
      depth: { mae: 0.02, p95: 0.04 },
    },
  });
  const aggregate = aggregateVisualEvidence([first, second]);
  assert.equal(aggregate.geometry.silhouette.meanIou, 0.95);
  assert.equal(aggregate.geometry.silhouette.worstViewIou, 0.93);
  assert.equal(aggregate.geometry.silhouette.meanEdgeDistancePixels, 1.5);
  assert.equal(aggregate.geometry.silhouette.edgeDistanceP95Pixels, 4);
  assert.equal(aggregate.geometry.depth.mae, 0.015);
  assert.equal(aggregate.geometry.depth.p95, 0.04);
});

test("buffers of the wrong shape are refused rather than measured", () => {
  assert.throws(
    () =>
      evaluateGeometryView({
        width: 3,
        height: 3,
        referenceSilhouette: new Uint8Array(4),
        replacementSilhouette: mask(3, 3, []),
        referenceBounds: { min: [0, 0, 0], max: [1, 1, 1] },
        replacementBounds: { min: [0, 0, 0], max: [1, 1, 1] },
      }),
    /RGBA bytes/,
  );
  assert.throws(
    () =>
      evaluateGeometryView({
        width: 3,
        height: 3,
        referenceSilhouette: mask(3, 3, []),
        replacementSilhouette: mask(3, 3, []),
        referenceDepth: grayscale([0, 0, 0, 0, 0, 0, 0, 0, 0]),
        referenceBounds: { min: [0, 0, 0], max: [1, 1, 1] },
        replacementBounds: { min: [0, 0, 0], max: [1, 1, 1] },
      }),
    /must be provided together/,
  );
});
