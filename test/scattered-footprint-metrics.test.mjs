import assert from "node:assert/strict";
import test from "node:test";

import { silhouetteEvidence } from "../tools/evaluation/scene-pass-metrics.mjs";

/**
 * What the silhouette metrics read when the subject is a scatter.
 *
 * ADR-0067 argues from two lines of algebra that `silhouetteIoU` prefers a solid blob over
 * a faithful scatter, and checks the first line against the rendered `paths` group. This is
 * the other half: the same question put to the gate's own `silhouetteEvidence`, on masks
 * built here, where the right answer is known because both sides were constructed.
 *
 * A fixture rather than a scene, for the reason ADR-0053 gives about the contour
 * instability it also found this way: a synthetic case can be made to hold everything fixed
 * except the one property under test, and a rendered scene cannot.
 */

const WIDTH = 256;
const HEIGHT = 256;
const COVERAGE = 0.1862; // the measured median for `paving-slab`
const BLOB_COVERAGE = 0.75; // a regular hexagon inscribed in its own bounding rectangle

/** A deterministic generator, so a failure is reproducible rather than a bad afternoon. */
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function toRgba(mask) {
  const rgba = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let index = 0; index < mask.length; index += 1) {
    const at = index * 4;
    const on = mask[index] ? 255 : 0;
    rgba[at] = on;
    rgba[at + 1] = on;
    rgba[at + 2] = on;
    rgba[at + 3] = 255;
  }
  return rgba;
}

/**
 * A scatter of round stones covering `coverage` of the frame.
 *
 * Stones rather than random pixels: the authored paving slab is a patch of cobbles, and a
 * per-pixel scatter would have a boundary length no real footprint has, which is exactly
 * the quantity the contour metric reads.
 */
function scatter(seed, coverage) {
  const next = rng(seed);
  const mask = new Uint8Array(WIDTH * HEIGHT);
  const radius = 5;
  const target = coverage * WIDTH * HEIGHT;
  let painted = 0;
  let guard = 0;
  while (painted < target && guard < 20000) {
    guard += 1;
    const cx = next() * WIDTH;
    const cy = next() * HEIGHT;
    for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(HEIGHT, cy + radius); y += 1) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(WIDTH, cx + radius); x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
        const index = y * WIDTH + x;
        if (mask[index]) continue;
        mask[index] = 1;
        painted += 1;
      }
    }
  }
  return mask;
}

/** A single solid disc covering `coverage` of the frame, centred like the scatter. */
function blob(coverage) {
  const mask = new Uint8Array(WIDTH * HEIGHT);
  const radius = Math.sqrt((coverage * WIDTH * HEIGHT) / Math.PI);
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) mask[y * WIDTH + x] = 1;
    }
  }
  return mask;
}

const reference = scatter(1, COVERAGE);
const faithful = scatter(9999, COVERAGE); // same statistics, different instance positions
const overDrawn = blob(BLOB_COVERAGE);

const measure = (left, right) =>
  silhouetteEvidence(toRgba(left), toRgba(right), WIDTH, HEIGHT);

test("silhouette IoU scores a faithful scatter below a solid blob that is four times too big", () => {
  /**
   * The finding, put to the gate's own function. Both candidates are compared with the same
   * reference; one reproduces its statistics exactly and the other is a single disc covering
   * four times the area.
   */
  const faithfulRun = measure(reference, faithful);
  const overDrawnRun = measure(reference, overDrawn);

  assert.ok(
    faithfulRun.intersectionOverUnion < overDrawnRun.intersectionOverUnion,
    `the faithful scatter scored ${faithfulRun.intersectionOverUnion} against the ` +
      `over-drawn blob's ${overDrawnRun.intersectionOverUnion}, so this fixture is not ` +
      "reproducing the effect it exists to pin down",
  );

  // And not marginally. The algebra says c/(2-c) against c/C, a ratio near 0.41.
  const ratio = faithfulRun.intersectionOverUnion / overDrawnRun.intersectionOverUnion;
  assert.ok(
    ratio < 0.75,
    `the penalty for being right is only ${ratio.toFixed(3)}x, where the algebra predicts ` +
      "about 0.41; if this has drifted, ADR-0067's argument needs re-deriving",
  );
});

test("the IoU a faithful scatter can reach is bounded by its own coverage", () => {
  // c / (2 - c) = 0.1862 / 1.8138 = 0.1027. Nothing about the quality of the reproduction
  // moves this; it is what two independent draws of the same distribution score.
  const predicted = COVERAGE / (2 - COVERAGE);
  const { intersectionOverUnion } = measure(reference, faithful);
  assert.ok(
    Math.abs(intersectionOverUnion - predicted) < 0.05,
    `two independent scatters scored ${intersectionOverUnion} where c/(2-c) predicts ` +
      `${predicted.toFixed(4)}`,
  );
});

test("contour distance prefers the faithful scatter, which is why it is the usable metric", () => {
  /**
   * ADR-0067 claims contour distance does not share the pathology because it compares
   * boundaries rather than areas. That claim was asserted before it was tested, and this is
   * the test. If it fails, the ADR's "what survives" section is wrong and the fixed-camera
   * layer has no trustworthy geometry metric on a scattered group at all.
   */
  const faithfulRun = measure(reference, faithful);
  const overDrawnRun = measure(reference, overDrawn);
  assert.ok(
    faithfulRun.contourDistance.p95 < overDrawnRun.contourDistance.p95,
    `contour p95 is ${faithfulRun.contourDistance.p95} for the faithful scatter against ` +
      `${overDrawnRun.contourDistance.p95} for the over-drawn blob, so contour agrees with ` +
      "IoU and neither metric can tell a correct scatter from a wrong one",
  );
});

test("contour distance has its own floor on a scatter, and it is not zero", () => {
  // The floor matters as much as the direction: if it sat near the 6.536774 threshold the
  // metric would be unusable for a different reason. Two independent draws are compared,
  // so whatever this reads is what a perfect statistical reproduction reads.
  const { contourDistance } = measure(reference, faithful);
  assert.ok(contourDistance.p95 > 0, "a scatter compared with an independent draw read zero");
  assert.ok(
    contourDistance.p95 < 40,
    `the contour floor on a scatter is ${contourDistance.p95}, far enough above the ` +
      "6.536774 threshold that contour is no more usable here than IoU",
  );
});
