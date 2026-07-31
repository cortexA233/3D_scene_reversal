import assert from "node:assert/strict";
import test from "node:test";

import {
  SCENE_PASSES,
  SURFACE_CORRESPONDENCE_WORLD_UNITS,
  aggregateCameras,
  appearanceEvidence,
  binaryMask,
  decodeLinearDepth,
  depthEvidence,
  semanticEvidence,
  silhouetteEvidence,
  worldNormalEvidence,
} from "../tools/evaluation/scene-pass-metrics.mjs";

const WIDTH = 64;
const HEIGHT = 48;

function blank() {
  return new Uint8Array(WIDTH * HEIGHT * 4);
}

function fillRect(rgba, x0, y0, x1, y1, [r, g, b]) {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

function encodeDepth(rgba, x0, y0, x1, y1, normalized) {
  const scaled = Math.round(normalized * 16777215);
  return fillRect(rgba, x0, y0, x1, y1, [
    Math.floor(scaled / 65536),
    Math.floor((scaled % 65536) / 256),
    scaled % 256,
  ]);
}

test("the pass set is the six declared encodings", () => {
  assert.deepEqual(SCENE_PASSES, [
    "semantic",
    "materialFamily",
    "silhouette",
    "linearDepth",
    "worldNormal",
    "litRgb",
  ]);
});

test("appearance reports material families as a partition independent of groups", () => {
  const reference = fillRect(blank(), 0, 0, WIDTH, HEIGHT, [200, 200, 200]);
  const candidate = fillRect(blank(), 0, 0, WIDTH, HEIGHT, [200, 200, 200]);
  // One wrong material spanning half of a group that is otherwise right.
  fillRect(candidate, 0, 0, WIDTH / 2, HEIGHT, [40, 200, 200]);

  const wholeGroup = new Uint8Array(WIDTH * HEIGHT).fill(1);
  const wrongFamily = new Uint8Array(WIDTH * HEIGHT);
  const rightFamily = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      (x < WIDTH / 2 ? wrongFamily : rightFamily)[y * WIDTH + x] = 1;
    }
  }

  const evidence = appearanceEvidence(
    reference,
    candidate,
    WIDTH,
    HEIGHT,
    { plazas: wholeGroup },
    { "paving-stone": wrongFamily, "painted-timber": rightFamily },
  );

  assert.equal(evidence.materialFamilies["painted-timber"].mean, 0);
  assert.ok(evidence.materialFamilies["paving-stone"].mean > 20);
  // The group average halves the damage; the family isolates it. This is why the
  // appearance layer gates families as well as groups.
  assert.ok(
    evidence.materialFamilies["paving-stone"].mean > evidence.regions.plazas.mean * 1.9,
  );
});

test("aggregation keeps the worst material family and the worst confusion", () => {
  const views = [
    {
      camera: "authoredOverview",
      semantic: {
        comparedPixels: 1000,
        agreementFraction: 0.9,
        confusion: { "plazas->plazas": 500, "vegetation->geography": 90 },
      },
      appearance: {
        deltaE: { mean: 5 },
        materialFamilies: { "paving-stone": { mean: 3 }, "palm-foliage": { mean: 41 } },
      },
      byGroup: {},
      silhouette: { intersectionOverUnion: 0.9, contourDistance: { p95: 4 } },
    },
    {
      camera: "oblique-north",
      semantic: {
        comparedPixels: 1000,
        agreementFraction: 0.8,
        confusion: { "vegetation->geography": 120 },
      },
      appearance: {
        deltaE: { mean: 9 },
        materialFamilies: { "paving-stone": { mean: 7 } },
      },
      byGroup: {},
      silhouette: { intersectionOverUnion: 0.8, contourDistance: { p95: 6 } },
    },
  ];

  const aggregate = aggregateCameras(views);
  assert.deepEqual(aggregate.appearanceByMaterialFamily.worst, {
    camera: "authoredOverview",
    label: "palm-foliage",
    value: 41,
  });
  // A same-label transition is agreement, not confusion, and must not win.
  assert.equal(aggregate.semanticConfusion.worst.transition, "vegetation->geography");
  assert.equal(aggregate.semanticConfusion.worst.camera, "oblique-north");
  assert.equal(aggregate.semanticConfusion.worstFraction, 0.12);
});

test("silhouette evidence is exact for identity and reports a known shift", () => {
  const reference = fillRect(blank(), 10, 10, 30, 30, [255, 255, 255]);
  const identical = silhouetteEvidence(reference, reference, WIDTH, HEIGHT);
  assert.equal(identical.intersectionOverUnion, 1);
  assert.equal(identical.contourDistance.max, 0);
  assert.equal(identical.referenceOnlyFraction, 0);

  const shifted = fillRect(blank(), 14, 10, 34, 30, [255, 255, 255]);
  const moved = silhouetteEvidence(reference, shifted, WIDTH, HEIGHT);
  // Two 20x20 squares offset by four pixels overlap on 16 of 24 columns.
  assert.ok(Math.abs(moved.intersectionOverUnion - 16 / 24) < 0.01);
  assert.ok(moved.contourDistance.max >= 3.9 && moved.contourDistance.max <= 4.1);
  assert.ok(moved.referenceOnlyFraction > 0 && moved.candidateOnlyFraction > 0);

  const missing = silhouetteEvidence(reference, blank(), WIDTH, HEIGHT);
  assert.equal(missing.intersectionOverUnion, 0);
  assert.ok(missing.referenceOnlyFraction > 0);
});

test("linear depth decodes and compares in world units", () => {
  const near = 0.5;
  const far = 1000.5;
  const reference = encodeDepth(blank(), 10, 10, 30, 30, 0.25);
  const candidate = encodeDepth(blank(), 10, 10, 30, 30, 0.35);

  assert.ok(Math.abs(decodeLinearDepth(reference, 12 * WIDTH + 12) - 0.25) < 1e-4);
  // Coverage is the silhouette, not the depth values: a near surface encodes
  // dark and must still be compared.
  const mask = binaryMask(fillRect(blank(), 10, 10, 30, 30, [255, 255, 255]));
  const evidence = depthEvidence(reference, candidate, WIDTH, HEIGHT, near, far, mask);
  assert.equal(evidence.comparedPixels, 400);
  assert.ok(Math.abs(evidence.worldUnits.mean - 100) < 0.5);
  assert.equal(
    depthEvidence(reference, reference, WIDTH, HEIGHT, near, far, mask).worldUnits.max,
    0,
  );
  assert.throws(
    () => depthEvidence(reference, candidate, WIDTH, HEIGHT, near, far),
    /shared silhouette mask/,
  );
});

test("world normal error is reported in degrees on the shared mask", () => {
  const up = fillRect(blank(), 10, 10, 30, 30, [128, 255, 128]);
  const sideways = fillRect(blank(), 10, 10, 30, 30, [255, 128, 128]);
  const mask = binaryMask(fillRect(blank(), 10, 10, 30, 30, [255, 255, 255]));

  assert.equal(worldNormalEvidence(up, up, WIDTH, HEIGHT, mask).degrees.max, 0);
  const perpendicular = worldNormalEvidence(up, sideways, WIDTH, HEIGHT, mask);
  assert.ok(Math.abs(perpendicular.degrees.mean - 90) < 1.5);
  assert.equal(perpendicular.comparedPixels, 400);
});

test("world normal is compared only where both subjects see the same surface", () => {
  const up = fillRect(blank(), 10, 10, 30, 30, [128, 255, 128]);
  const sideways = fillRect(blank(), 10, 10, 30, 30, [255, 128, 128]);
  const mask = binaryMask(fillRect(blank(), 10, 10, 30, 30, [255, 255, 255]));
  const near = 0.5;
  const far = 1000;
  // A 24-bit linear-depth encoding of a chosen world distance.
  const atDepth = (worldUnits) => {
    const scaled = Math.round(
      ((worldUnits - near) / (far - near)) * 16777215,
    );
    return fillRect(blank(), 10, 10, 30, 30, [
      Math.floor(scaled / 65536),
      Math.floor((scaled % 65536) / 256),
      scaled % 256,
    ]);
  };

  // Same place, different orientation: this is a real normal error and must be
  // reported.
  const rotated = worldNormalEvidence(up, sideways, WIDTH, HEIGHT, mask, {
    referenceDepth: atDepth(100),
    candidateDepth: atDepth(100),
    near,
    far,
  });
  assert.equal(rotated.comparedPixels, 400);
  assert.equal(rotated.correspondingFraction, 1);
  assert.ok(Math.abs(rotated.degrees.mean - 90) < 1.5);

  // A different surface 40 units away is not the same surface turned, and its
  // angle says nothing about orientation. This is the case that saturated the
  // metric on the real island, where a sub-pixel shift makes a pixel see the
  // other side of a leaf.
  const elsewhere = worldNormalEvidence(up, sideways, WIDTH, HEIGHT, mask, {
    referenceDepth: atDepth(100),
    candidateDepth: atDepth(140),
    near,
    far,
  });
  assert.equal(elsewhere.comparedPixels, 0);
  assert.equal(elsewhere.correspondingFraction, 0);
  assert.equal(elsewhere.degrees, null);
  // The discarded evidence is still reported, so a restriction that threw away
  // the whole frame cannot look like agreement.
  assert.equal(elsewhere.sharedPixels, 400);
  assert.ok(Math.abs(elsewhere.allSharedPixelDegrees.mean - 90) < 1.5);

  // Inside the declared tolerance it is still the same surface.
  const nudged = worldNormalEvidence(up, sideways, WIDTH, HEIGHT, mask, {
    referenceDepth: atDepth(100),
    candidateDepth: atDepth(101),
    near,
    far,
  });
  assert.equal(nudged.comparedPixels, 400);
  assert.equal(nudged.toleranceWorldUnits, SURFACE_CORRESPONDENCE_WORLD_UNITS);
});

test("semantic evidence separates occupancy from confusion", () => {
  const labels = { 1: "structures", 2: "vegetation" };
  const reference = Uint8Array.from({ length: 100 }, (_unused, index) => (index < 60 ? 1 : 2));
  const identical = semanticEvidence(reference, reference, labels);
  assert.equal(identical.agreementFraction, 1);
  assert.deepEqual(identical.confusion, {});
  assert.equal(identical.occupancy.find((row) => row.label === "structures").relativeError, 0);

  // The candidate fills the same pixels with the wrong content.
  const swapped = Uint8Array.from({ length: 100 }, (_unused, index) => (index < 60 ? 2 : 1));
  const confused = semanticEvidence(reference, swapped, labels);
  assert.equal(confused.agreementFraction, 0);
  assert.equal(confused.confusion["structures->vegetation"], 60);
  assert.equal(confused.confusion["vegetation->structures"], 40);
  assert.ok(confused.occupancy.find((row) => row.label === "structures").relativeError > 0);
});

test("appearance evidence reports global and per-region difference", () => {
  const reference = fillRect(fillRect(blank(), 0, 0, WIDTH, HEIGHT, [30, 60, 90]), 10, 10, 30, 30, [200, 40, 40]);
  const identical = appearanceEvidence(reference, reference, WIDTH, HEIGHT);
  assert.equal(identical.deltaE.max, 0);
  assert.deepEqual(identical.referenceChannelMeans, identical.candidateChannelMeans);

  const candidate = fillRect(fillRect(blank(), 0, 0, WIDTH, HEIGHT, [30, 60, 90]), 10, 10, 30, 30, [40, 200, 40]);
  const region = binaryMask(fillRect(blank(), 10, 10, 30, 30, [255, 255, 255]));
  const damaged = appearanceEvidence(candidate, reference, WIDTH, HEIGHT, { structures: region });
  assert.ok(damaged.deltaE.max > 40);
  assert.ok(damaged.regions.structures.mean > 40);
  // A small wrong region must not be averaged away by the correct background.
  assert.ok(damaged.regions.structures.mean > damaged.deltaE.mean * 2);
});

test("camera aggregation keeps the worst view, not just the mean", () => {
  const view = (camera, iou, deltaE) => ({
    camera,
    silhouette: { intersectionOverUnion: iou, contourDistance: { p95: 1 } },
    depth: { worldUnits: { p95: 2 } },
    worldNormal: { degrees: { p95: 3 }, unsignedDegrees: { p95: 2 } },
    semantic: { agreementFraction: iou },
    appearance: { deltaE: { mean: deltaE } },
  });
  const aggregate = aggregateCameras([
    view("authoredOverview", 0.95, 4),
    view("oblique-north", 0.4, 22),
    view("topDown", 0.9, 5),
  ]);

  assert.equal(aggregate.cameras, 3);
  assert.equal(aggregate.silhouetteIoU.worst.camera, "oblique-north");
  assert.equal(aggregate.silhouetteIoU.worst.value, 0.4);
  assert.equal(aggregate.appearanceDeltaE.worst.camera, "oblique-north");
  assert.equal(aggregate.semanticAgreement.worst.camera, "oblique-north");
  // The favourable overview cannot hide the opposing view.
  assert.ok(aggregate.silhouetteIoU.mean > aggregate.silhouetteIoU.worst.value);
});

/**
 * Distributed Scene Cover is kept out of the worst-group *intersection* and out of
 * nothing else.
 *
 * A per-pixel intersection is an instance pairing, and cover is defined as
 * compared "by semantic occupancy and spatial distribution rather than arbitrary
 * instance pairing". Measured through the corrected passes, a mild 0.02-radian yaw
 * of the reference against itself takes cover's IoU to 0.0415, so a maximum over
 * every camera and group reports cover as the scene's worst failure whatever the
 * island looks like.
 *
 * The danger in that correction is obvious and this fixture is what bounds it: a
 * scope is one keystroke away from being a way to hide an unfavourable group. So
 * cover stays in every mean, stays in the contour and depth maxima whose brackets
 * do separate on it, and its intersection is still reported.
 */
test("cover is excluded from the worst-group intersection and from nothing else", () => {
  const row = (iou, contour, depth) => ({
    intersectionOverUnion: iou,
    referencePixels: 100,
    candidatePixels: 100,
    contourDistance: { p95: contour },
    depth: { worldUnits: { p95: depth } },
    worldNormal: { degrees: { p95: 4 }, unsignedDegrees: { p95: 3 } },
  });
  const aggregate = aggregateCameras([
    {
      camera: "authoredOverview",
      byGroup: {
        structures: row(0.8, 3, 5),
        // The worst of everything, on every metric.
        cover: row(0.02, 900, 400),
      },
    },
  ]);

  // Out of the intersection maximum.
  assert.equal(aggregate.groupSilhouetteIoU.worst.label, "structures");
  assert.equal(aggregate.groupSilhouetteIoU.worst.value, 0.8);
  // Reported rather than dropped, so a review can still see it.
  assert.equal(aggregate.groupSilhouetteIoU.worstDistributed.label, "cover");
  assert.equal(aggregate.groupSilhouetteIoU.worstDistributed.value, 0.02);
  // In the mean, which is not a maximum and cannot be defined by one group.
  assert.equal(aggregate.groupSilhouetteIoU.mean, 0.41);
  // In every other maximum, because those brackets separate mild from severe on
  // cover: contour distance asks how far the nearest cover pixel is, which is a
  // distribution question, and depth is measured where the mask already agrees.
  assert.equal(aggregate.groupContourDistance.worst.label, "cover");
  assert.equal(aggregate.groupDepthWorldUnits.worst.label, "cover");
  // Gated on the unsigned comparison, with the signed one retained beside it (ADR-0064).
  assert.equal(aggregate.groupWorldNormalDegrees.worst.value, 3);
  assert.equal(aggregate.groupWorldNormalDegrees.signedWorst.value, 4);
});

import { createReferenceObservationContract } from "../tools/reference/reference-observation-contract.mjs";
import {
  PROTOCOL_TOLERANCE,
  REQUIRED_CAMERAS,
  verifyScenePassProtocol,
} from "../tools/evaluation/scene-pass-protocol.mjs";

const contract = createReferenceObservationContract();

function compliantReport() {
  return {
    capture: {
      framebuffer: [...contract.capture.framebuffer],
      deviceScaleFactor: contract.capture.deviceScaleFactor,
      momentMs: contract.clock.primaryMomentMs,
    },
    protocol: Array.from({ length: REQUIRED_CAMERAS }, (_unused, index) => ({
      camera: `camera-${index}`,
      viewMatrixDelta: 0,
      projectionMatrixDelta: 0,
      framebuffer: [...contract.capture.framebuffer],
      near: contract.cameras.authoredOverview.near,
      far: contract.cameras.authoredOverview.far,
    })),
    subjects: {
      sharedLighting: false,
      referenceMutated: false,
      candidateReframed: false,
    },
  };
}

test("the frozen pass protocol accepts a compliant run", () => {
  assert.deepEqual(verifyScenePassProtocol({ report: compliantReport(), contract }), []);
});

test("a reframed candidate, shared lighting, or a modified reference all fail", () => {
  const reframed = compliantReport();
  reframed.protocol[2].viewMatrixDelta = PROTOCOL_TOLERANCE * 100;
  assert.ok(
    verifyScenePassProtocol({ report: reframed, contract }).some((error) =>
      error.includes("view matrix"),
    ),
  );

  const declaredReframe = compliantReport();
  declaredReframe.subjects.candidateReframed = true;
  assert.ok(
    verifyScenePassProtocol({ report: declaredReframe, contract }).some((error) =>
      error.includes("framed from itself"),
    ),
  );

  const shared = compliantReport();
  shared.subjects.sharedLighting = true;
  assert.ok(
    verifyScenePassProtocol({ report: shared, contract }).some((error) =>
      error.includes("injected lighting"),
    ),
  );

  const mutated = compliantReport();
  mutated.subjects.referenceMutated = true;
  assert.ok(
    verifyScenePassProtocol({ report: mutated, contract }).some((error) =>
      error.includes("Immutable Reference Capture"),
    ),
  );
});

test("framebuffer, device scale, clipping, camera count, and moment are all blocking", () => {
  const cases = [
    [(report) => (report.capture.framebuffer = [1280, 720]), "Normative Scene Capture"],
    [(report) => (report.capture.deviceScaleFactor = 2), "device scale factor"],
    [(report) => (report.capture.momentMs = 15000), "moment"],
    [(report) => report.protocol.pop(), "Camera Set"],
    [(report) => (report.protocol[0].near = 1), "near plane"],
    [(report) => (report.protocol[0].far = 5000), "far plane"],
    [(report) => (report.protocol[1].framebuffer = [720, 405]), "framebuffer"],
    [
      (report) => (report.protocol[3].projectionMatrixDelta = 0.01),
      "projection matrix",
    ],
  ];
  for (const [damage, expected] of cases) {
    const report = compliantReport();
    damage(report);
    const errors = verifyScenePassProtocol({ report, contract });
    assert.ok(
      errors.some((error) => error.includes(expected)),
      `expected a ${expected} failure, got ${JSON.stringify(errors)}`,
    );
  }
});

import { groupGeometryEvidence } from "../tools/evaluation/scene-pass-metrics.mjs";

test("per-group evidence exposes a village that a global silhouette would hide", () => {
  const labels = { 1: "sky", 2: "geography", 3: "structures" };
  const pixels = WIDTH * HEIGHT;
  // Both subjects fill the frame with sky and geography, so the global
  // silhouette agrees perfectly. Only the structures differ.
  const referenceIds = new Uint8Array(pixels);
  const candidateIds = new Uint8Array(pixels);
  for (let index = 0; index < pixels; index += 1) {
    const y = Math.floor(index / WIDTH);
    referenceIds[index] = y < 20 ? 1 : 2;
    candidateIds[index] = y < 20 ? 1 : 2;
  }
  for (let y = 24; y < 34; y += 1) {
    for (let x = 10; x < 20; x += 1) referenceIds[y * WIDTH + x] = 3;
    for (let x = 40; x < 50; x += 1) candidateIds[y * WIDTH + x] = 3;
  }

  const global = silhouetteEvidence(
    fillRect(blank(), 0, 0, WIDTH, HEIGHT, [255, 255, 255]),
    fillRect(blank(), 0, 0, WIDTH, HEIGHT, [255, 255, 255]),
    WIDTH,
    HEIGHT,
  );
  assert.equal(global.intersectionOverUnion, 1, "the global silhouette is uninformative here");

  const rows = groupGeometryEvidence({
    referenceIds,
    candidateIds,
    referenceDepth: blank(),
    candidateDepth: blank(),
    referenceNormal: blank(),
    candidateNormal: blank(),
    width: WIDTH,
    height: HEIGHT,
    near: 0.5,
    far: 1000,
    labels,
  });

  assert.equal(rows.structures.intersectionOverUnion, 0, "the misplaced village must show");
  assert.equal(rows.structures.referencePixels, 100);
  assert.equal(rows.structures.candidatePixels, 100);
  assert.ok(rows.sky.intersectionOverUnion > 0.99);

  const aggregate = aggregateCameras([
    { camera: "authoredOverview", ...emptyView(), byGroup: rows },
  ]);
  assert.equal(aggregate.groupSilhouetteIoU.worst.label, "structures");
  assert.equal(aggregate.groupSilhouetteIoU.worst.value, 0);

  // Contour distance has the same blind spot as IoU when it is taken over the
  // whole frame: the frame-filling mask's outline is the frame border, so it
  // reports agreement while the village is 30 pixels away from where it belongs.
  assert.equal(global.contourDistance.p95, 0, "whole-frame contour is uninformative here");
  assert.equal(aggregate.groupContourDistance.worst.label, "structures");
  assert.ok(
    aggregate.groupContourDistance.worst.value >= 25,
    `per-group contour must see the displaced village, got ${aggregate.groupContourDistance.worst.value}`,
  );
});

function emptyView() {
  return {
    silhouette: { intersectionOverUnion: 1, contourDistance: { p95: 0 } },
    depth: { worldUnits: { p95: 0 } },
    worldNormal: { degrees: { p95: 0 }, unsignedDegrees: { p95: 0 } },
    semantic: { agreementFraction: 1 },
    appearance: { deltaE: { mean: 0 } },
  };
}

test("contour distance is undefined against a subject that rendered nothing", () => {
  const present = fillRect(blank(), 10, 10, 30, 30, [255, 255, 255]);
  const absent = blank();

  // A deleted group leaves no contour to measure a distance to. Reporting a
  // number here means reporting the distance-transform sentinel, which is about
  // 1e9 per unmatched pixel and would calibrate a threshold that accepts
  // everything.
  const deleted = silhouetteEvidence(present, absent, WIDTH, HEIGHT);
  assert.equal(deleted.contourDistance, null);
  assert.equal(deleted.intersectionOverUnion, 0, "absence is reported by IoU instead");
  assert.equal(deleted.contourPixels.candidate, 0);

  // Disjoint but present on both sides is a real distance and must be measured.
  const moved = silhouetteEvidence(
    present,
    fillRect(blank(), 34, 10, 54, 30, [255, 255, 255]),
    WIDTH,
    HEIGHT,
  );
  assert.equal(moved.intersectionOverUnion, 0);
  assert.ok(moved.contourDistance.p95 > 0 && moved.contourDistance.p95 < 100);
});

test("contour distance on a scattered group is unstable to a handful of pixels", () => {
  /**
   * A recorded property of the frozen metric, not a change to it.
   *
   * `contourDistance` collects, for every reference contour pixel, its distance to the
   * nearest *candidate* contour pixel. On a sparse scattered group one candidate pixel
   * can therefore be the nearest neighbour for a whole region of reference pixels, and
   * removing it moves all of them at once. So a change that leaves the group's silhouette
   * agreement alone — or improves it — can still multiply its contour p95.
   *
   * This is not hypothetical. Adding a ground structure to eight structural trees moved
   * `rocks` on `authoredOverview` by *one* candidate pixel, leaving its IoU at 0.204 to
   * six figures, while its contour p95 went 43.1 to 186.7; on `oblique-south` thirteen
   * pixels took it 7.2 to 53.7. `wildlife` did the same on three pixels, 53.3 to 120.1.
   * Those two groups' generators did not change at all.
   *
   * The consequence for whoever reads this layer: `groupContourDistance` cannot be used
   * on its own to accept or reject a change to a *different* group, because the knock-on
   * through occlusion is larger than the signal. Pair it with the group's own IoU and
   * pixel ratio. Making the metric robust is a versioned gate revision with its own
   * reference-only recalibration and ADR, and it invalidates every stored capture, so it
   * is named here rather than taken as a side effect of a form change.
   */
  const speck = (rgba, cx, cy, radius) =>
    fillRect(rgba, cx - radius, cy - radius, cx + radius + 1, cy + radius + 1, [255, 255, 255]);

  // A near row of specks the candidate matches one for one, plus a tight far cluster the
  // candidate covers with a single speck in its middle.
  const reference = blank();
  for (let index = 0; index < 5; index += 1) speck(reference, 8 + index * 10, 6, 2);
  for (const x of [24, 30, 36]) speck(reference, x, 42, 2);

  const paired = blank();
  for (let index = 0; index < 5; index += 1) speck(paired, 9 + index * 10, 7, 2);
  const lone = new Uint8Array(paired);
  speck(lone, 30, 42, 1);

  const withLone = silhouetteEvidence(reference, lone, WIDTH, HEIGHT);
  const withoutLone = silhouetteEvidence(reference, paired, WIDTH, HEIGHT);

  // Nine candidate pixels, and the silhouette agreement barely notices them.
  assert.ok(
    Math.abs(withLone.intersectionOverUnion - withoutLone.intersectionOverUnion) < 0.06,
    `IoU moved ${withLone.intersectionOverUnion} to ${withoutLone.intersectionOverUnion}`,
  );
  // The contour p95 more than doubles on the same nine pixels.
  assert.ok(
    withoutLone.contourDistance.p95 > withLone.contourDistance.p95 * 1.8,
    `contour p95 moved only ${withLone.contourDistance.p95} to ${withoutLone.contourDistance.p95}`,
  );
});

test("nothing confused is a fraction of zero, and nothing compared is null", () => {
  // The gate stack reads a null as missing evidence and fails the metric, so a
  // subject that mislabels nothing must not report null for the metric that
  // exists to catch mislabelling.
  const perfect = aggregateCameras([
    {
      camera: "authoredOverview",
      ...emptyView(),
      semantic: { agreementFraction: 1, comparedPixels: 4000, confusion: {} },
    },
  ]);
  assert.equal(perfect.semanticConfusion.worstFraction, 0);
  assert.equal(perfect.semanticConfusion.worst, null);

  // A capture that compared no pixels measured nothing, and that stays null.
  const unmeasured = aggregateCameras([
    {
      camera: "authoredOverview",
      ...emptyView(),
      semantic: { agreementFraction: 1, comparedPixels: 0, confusion: {} },
    },
  ]);
  assert.equal(unmeasured.semanticConfusion.worstFraction, null);

  // A view that skipped the auxiliary passes altogether is also null, not zero.
  const appearanceOnly = aggregateCameras([
    { camera: "authoredOverview", appearance: { deltaE: { mean: 3 } } },
  ]);
  assert.equal(appearanceOnly.semanticConfusion.worstFraction, null);
  assert.equal(appearanceOnly.appearanceDeltaE.meanMean, 3);
  assert.equal(appearanceOnly.groupSilhouetteIoU.mean, null);
});
