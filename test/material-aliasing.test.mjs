import assert from "node:assert/strict";
import test from "node:test";

import {
  downsampleRgbaBox,
  evaluateScaleConsistency,
} from "../gt_designer/single-mesh-evaluation/material-aliasing-runner.js";

function solid(width, height, value) {
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels.set([value, value, value, 255], index * 4);
  }
  return pixels;
}

test("box downsampling averages subpixel color instead of point sampling", () => {
  const pixels = new Uint8Array([
    0, 0, 0, 255, 255, 255, 255, 255,
    255, 255, 255, 255, 0, 0, 0, 255,
  ]);
  assert.deepEqual(
    [...downsampleRgbaBox(pixels, 2, 2, 2)],
    [128, 128, 128, 255],
  );
});

test("scale consistency rejects a point-sampled high-frequency field", () => {
  const high = new Uint8Array(8 * 8 * 4);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const value = (x + y) % 2 === 0 ? 0 : 255;
      high.set([value, value, value, 255], (y * 8 + x) * 4);
    }
  }
  const result = evaluateScaleConsistency({
    highAlbedo: high,
    highWidth: 8,
    highHeight: 8,
    lowAlbedo: solid(4, 4, 255),
    lowSilhouette: solid(4, 4, 255),
    lowWidth: 4,
    lowHeight: 4,
  });
  assert.equal(result.comparedPixels, 4);
  assert.ok(result.meanAbsoluteChannelError > 100);
  assert.ok(result.p95AbsoluteChannelError > 100);
});

test("scale consistency accepts a stable band-limited field", () => {
  const result = evaluateScaleConsistency({
    highAlbedo: solid(8, 8, 96),
    highWidth: 8,
    highHeight: 8,
    lowAlbedo: solid(4, 4, 96),
    lowSilhouette: solid(4, 4, 255),
    lowWidth: 4,
    lowHeight: 4,
  });
  assert.equal(result.meanAbsoluteChannelError, 0);
  assert.equal(result.p95AbsoluteChannelError, 0);
});
