import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import {
  TERRAIN_CONTROL_BUDGET,
  TERRAIN_PROGRAM_VERSION,
  createCoastlineCurve,
  createTerrainProgramField,
  validateTerrainProgram,
} from "../gt_designer/src/reconstruction/scene/terrain-program.js";
import {
  compareGeography,
  contourArea,
  contourPerimeter,
  detectInlets,
  traceCoastContour,
} from "../tools/evaluation/geography-evidence.mjs";
import { elevationSampler } from "../tools/reconstruction/fit-terrain-program.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const elevationEvidence = JSON.parse(
  await readFile(
    path.join(
      PROJECT_ROOT,
      ".scratch/scene-parity-foundation/evidence/terrain-elevation-v1.json",
    ),
    "utf8",
  ),
);

/** A perfectly circular island with a flat plateau and a linear shore. */
function analyticIsland({ radius = 100, groundY = 26, seaLevel = 16, oceanFloor = -40 } = {}) {
  return (x, z) => {
    const normalized = Math.hypot(x, z) / radius;
    if (normalized <= 0.72) return groundY;
    if (normalized <= 1) {
      const t = (normalized - 0.72) / 0.28;
      return groundY + (seaLevel - groundY) * t;
    }
    return seaLevel + (oceanFloor - seaLevel) * Math.min(1, (normalized - 1) / 0.45);
  };
}

test("contour geometry matches an analytic circle", () => {
  const contour = traceCoastContour(analyticIsland({ radius: 100 }), [0, 0], 16, 720, 300);
  const area = contourArea(contour);
  const perimeter = contourPerimeter(contour);

  assert.ok(Math.abs(area - Math.PI * 100 * 100) / (Math.PI * 100 * 100) < 0.01);
  assert.ok(Math.abs(perimeter - 2 * Math.PI * 100) / (2 * Math.PI * 100) < 0.01);
  const radii = contour.map((point) => point.radius);
  assert.ok(Math.max(...radii) - Math.min(...radii) < 0.5);
});

/** An island whose shoreline radius is an explicit function of azimuth. */
function shapedIsland(radiusAt, { groundY = 26, seaLevel = 16, oceanFloor = -40 } = {}) {
  return (x, z) => {
    const radius = radiusAt(Math.atan2(z, x));
    const normalized = Math.hypot(x, z) / radius;
    if (normalized <= 0.72) return groundY;
    if (normalized <= 1) {
      return groundY + (seaLevel - groundY) * ((normalized - 0.72) / 0.28);
    }
    return seaLevel + (oceanFloor - seaLevel) * Math.min(1, (normalized - 1) / 0.45);
  };
}

test("an inlet is detected at its authored azimuth and depth", () => {
  // A 30-unit bay half a radian wide, centred on azimuth 1.0.
  const withInlet = shapedIsland((azimuth) => {
    const delta = Math.abs(Math.atan2(Math.sin(azimuth - 1), Math.cos(azimuth - 1)));
    return 100 - (delta < 0.5 ? 30 * (1 - delta / 0.5) : 0);
  });
  const inlets = detectInlets(traceCoastContour(withInlet, [0, 0], 16, 720, 300));

  assert.ok(inlets.length >= 1);
  const nearest = inlets.reduce((best, inlet) =>
    !best || Math.abs(inlet.azimuth - 1) < Math.abs(best.azimuth - 1) ? inlet : best,
  );
  assert.ok(Math.abs(nearest.azimuth - 1) < 0.05, `inlet azimuth ${nearest.azimuth}`);
  assert.ok(nearest.depth > 25 && nearest.depth < 35, `inlet depth ${nearest.depth}`);

  // A circular island has no inlet at all.
  assert.deepEqual(
    detectInlets(traceCoastContour(analyticIsland({ radius: 100 }), [0, 0], 16, 720, 300)),
    [],
  );
});

test("identical geography reports zero error and damage reports it", () => {
  const island = analyticIsland({ radius: 100 });
  const identical = compareGeography({
    referenceElevation: island,
    candidateElevation: island,
    centre: [0, 0],
    seaLevel: 16,
    seaLevelNormal: [0, 1, 0],
    oceanBounds: { min: [-1000, 15, -1000], max: [1000, 17, 1000] },
    cameraFrusta: [{ name: "test", centre: [0, 16, 0], radius: 500 }],
    probeResolution: 65,
    probeReach: 160,
  });
  assert.equal(identical.height.full.max, 0);
  assert.equal(identical.classification.agreementFraction, 1);
  assert.equal(identical.coastline.areaRelativeError, 0);
  assert.equal(identical.semanticSeaLevel.allFrustaCovered, true);

  const shrunk = compareGeography({
    referenceElevation: island,
    candidateElevation: analyticIsland({ radius: 80 }),
    centre: [0, 0],
    seaLevel: 16,
    seaLevelNormal: [0, 1, 0],
    oceanBounds: { min: [-1000, 15, -1000], max: [1000, 17, 1000] },
    probeResolution: 65,
    probeReach: 160,
  });
  assert.ok(shrunk.coastline.symmetricDistance.p95 > 15);
  assert.ok(shrunk.coastline.areaRelativeError > 0.3);
  assert.ok(shrunk.classification.agreementFraction < 0.95);

  const raised = compareGeography({
    referenceElevation: island,
    candidateElevation: (x, z) => island(x, z) + 9,
    centre: [0, 0],
    seaLevel: 16,
    seaLevelNormal: [0, 1, 0],
    oceanBounds: { min: [-1000, 15, -1000], max: [1000, 17, 1000] },
    probeResolution: 65,
    probeReach: 160,
  });
  assert.ok(Math.abs(raised.height.interior.mean - 9) < 0.001);
  // Raising the island leaves its interior height wrong while the shape holds,
  // which is a different failure from moving the shoreline.
  assert.ok(raised.coastline.areaRelativeError > 0);
});

test("a displaced or tilted sea plane is blocking", () => {
  const island = analyticIsland({ radius: 100 });
  const displaced = compareGeography({
    referenceElevation: island,
    candidateElevation: island,
    centre: [0, 0],
    seaLevel: 20,
    seaLevelNormal: [0, 1, 0],
    oceanBounds: { min: [-1000, 19, -1000], max: [1000, 21, 1000] },
    probeResolution: 33,
    probeReach: 160,
  });
  assert.equal(displaced.semanticSeaLevel.heightExact, false);

  const tilted = compareGeography({
    referenceElevation: island,
    candidateElevation: island,
    centre: [0, 0],
    seaLevel: 16,
    seaLevelNormal: [0.05, 0.998, 0],
    oceanBounds: { min: [-1000, 15, -1000], max: [1000, 17, 1000] },
    probeResolution: 33,
    probeReach: 160,
  });
  assert.equal(tilted.semanticSeaLevel.normalExact, false);
});

test("an ocean that misses one camera frustum is blocking", () => {
  const island = analyticIsland({ radius: 100 });
  const report = compareGeography({
    referenceElevation: island,
    candidateElevation: island,
    centre: [0, 0],
    seaLevel: 16,
    seaLevelNormal: [0, 1, 0],
    oceanBounds: { min: [-400, 15, -400], max: [400, 17, 400] },
    cameraFrusta: [
      { name: "near", centre: [0, 16, 0], radius: 300 },
      { name: "far-oblique", centre: [350, 16, 0], radius: 300 },
    ],
    probeResolution: 33,
    probeReach: 160,
  });

  assert.equal(report.semanticSeaLevel.allFrustaCovered, false);
  assert.equal(
    report.semanticSeaLevel.frustumCoverage.find((row) => row.camera === "far-oblique")
      .covered,
    false,
  );
});

test("the coastline curve is resolution independent and passes through its controls", () => {
  const nodes = [
    { azimuth: 0, radius: 100 },
    { azimuth: Math.PI / 2, radius: 130 },
    { azimuth: Math.PI, radius: 90 },
    { azimuth: (3 * Math.PI) / 2, radius: 110 },
  ];
  const curve = createCoastlineCurve(nodes);

  for (const node of nodes) {
    assert.ok(Math.abs(curve(node.azimuth) - node.radius) < 1e-9);
  }
  // Evaluating anywhere is legal: the shoreline has no resolution of its own.
  assert.ok(Number.isFinite(curve(0.123456789)));
  assert.ok(Math.abs(curve(2 * Math.PI) - curve(0)) < 1e-9);
  assert.ok(Math.abs(curve(-Math.PI / 2) - curve((3 * Math.PI) / 2)) < 1e-9);
});

test("the terrain program stays inside its frozen control budget", () => {
  const program = ISLAND_SCENE_RECIPE.terrain;

  assert.equal(program.version, TERRAIN_PROGRAM_VERSION);
  assert.deepEqual(validateTerrainProgram(program), []);
  assert.ok(program.coastline.nodes.length <= TERRAIN_CONTROL_BUDGET.coastNodes);
  assert.ok(program.landforms.length <= TERRAIN_CONTROL_BUDGET.landforms);
  assert.ok(program.noise.octaves <= TERRAIN_CONTROL_BUDGET.noiseOctaves);

  assert.ok(
    validateTerrainProgram({
      ...program,
      landforms: Array.from({ length: 41 }, () => program.landforms[0]),
    }).some((error) => error.includes("frozen budget")),
  );
  assert.ok(
    validateTerrainProgram({
      ...program,
      coastline: {
        ...program.coastline,
        nodes: Array.from({ length: 64 }, (_unused, index) => ({
          azimuth: (index / 64) * Math.PI * 2,
          radius: 300,
        })),
      },
    }).some((error) => error.includes("frozen budget")),
  );
});

test("the Scene Recipe retains no elevation grid or sampled coastline", () => {
  const serialized = JSON.stringify(ISLAND_SCENE_RECIPE.terrain);
  const numbers = serialized.match(/-?\d+(?:\.\d+)?/g) ?? [];

  assert.ok(
    numbers.length < 500,
    `the terrain program retains ${numbers.length} numbers, which is approaching a grid`,
  );
  assert.equal(
    JSON.stringify(ISLAND_SCENE_RECIPE.terrain).includes("coastlineRadii"),
    false,
  );
  assert.equal(elevationEvidence.heights.length, elevationEvidence.resolution ** 2);
  assert.ok(
    elevationEvidence.heights.length > numbers.length * 100,
    "the fitted program must be orders of magnitude smaller than the evidence it was fitted from",
  );
});

test("terrain tessellation is independent of the recipe's shape semantics", () => {
  const field = createTerrainProgramField(ISLAND_SCENE_RECIPE.terrain);
  const sampler = elevationSampler(elevationEvidence);
  const centre = ISLAND_SCENE_RECIPE.terrain.coastline.center;

  // The program can be evaluated at any position, at any density.
  for (const step of [7, 13, 29]) {
    const height = field(centre[0] + step * 3.7, centre[1] - step * 2.3);
    assert.ok(Number.isFinite(height));
  }
  assert.ok(Number.isFinite(sampler.at(centre[0], centre[1])));
});
