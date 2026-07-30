import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { generateScene } from "../gt_designer/src/reconstruction/scene/scene-generator.js";
import { createReferenceObservationContract } from "../tools/reference/reference-observation-contract.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const readJson = (relative) =>
  readFile(path.join(PROJECT_ROOT, relative), "utf8").then(JSON.parse);

const EVIDENCE = ".scratch/scene-parity-foundation/evidence";
const [baseline, passes, geography] = await Promise.all([
  readJson("tools/acceptance/baselines/scene-quality-baseline-v1.json"),
  readJson(`${EVIDENCE}/scene-passes-v1.json`),
  readJson(`${EVIDENCE}/geography-evidence-v1.json`),
]);

const contract = createReferenceObservationContract();
const ocean = ISLAND_SCENE_RECIPE.environment.ocean;
const limitFor = (name) =>
  baseline.layers.nativeAppearance.find((metric) => metric.name === name).threshold;

/**
 * The sea is about a million pixels of every auxiliary frame and it is the one
 * surface the reference renders through a shader the Production Runtime cannot
 * have: `THREE.Water` with a loaded normal map, a mirror reflection target, and
 * a Blinn-Phong sun term. The candidate answers it with an analytic surface, so
 * this is the gate that says whether the analytic version reads as water.
 *
 * Measured per material family rather than per region, because the `geography`
 * region is the sea and the terrain together and a good average over one cannot
 * be allowed to cover the other. Both are asserted.
 */
test("the sea is inside its calibrated appearance thresholds", async () => {
  const familyLimit = limitFor("worst material family appearance DeltaE");
  const regionLimit = limitFor("appearance DeltaE mean");

  const failures = [];
  for (const view of passes.views) {
    const sea = view.appearance?.materialFamilies?.["ocean-surface"];
    assert.ok(sea, `${view.camera} has no ocean-surface appearance evidence`);
    if (!(sea.mean <= familyLimit)) {
      failures.push(`${view.camera} ocean-surface: DeltaE ${sea.mean} is not <= ${familyLimit}`);
    }
    const region = view.appearance?.regions?.geography;
    if (region && !(region.mean <= regionLimit)) {
      failures.push(`${view.camera} geography: DeltaE ${region.mean} is not <= ${regionLimit}`);
    }
  }
  assert.deepEqual(
    failures,
    [],
    `the reconstructed sea is outside its calibrated thresholds:\n- ${failures.join("\n- ")}`,
  );
});

/**
 * The Semantic Sea Level is a datum, not a shape hint. Waves displace the
 * surface around it and may not move it, because the terrain's land, shore, and
 * sea classification is measured against the same number.
 */
test("the Semantic Sea Level datum is unmoved by the water surface", () => {
  assert.equal(ISLAND_SCENE_RECIPE.world.semanticSeaLevel, 16);
  assert.equal(contract.renderContract.ocean.y, 16);

  // The measured datum, from the evidence the gate stack reads, rather than
  // re-derived here where it could disagree with what acceptance sees.
  const datum = geography.semanticSeaLevel;
  assert.equal(datum.height, 16);
  assert.deepEqual(datum.normal, [0, 1, 0]);
  assert.equal(datum.heightExact, true);
  assert.equal(datum.normalExact, true);

  // Displacement is allowed, and it has to stay small enough that the datum is
  // still what the classification measures against: the terrain calls anything
  // within three units of sea level `shore`, so a swell that reaches into that
  // band would move the coastline rather than shade the water.
  const swell = Math.max(
    Math.abs(datum.oceanBounds.max[1] - 16),
    Math.abs(16 - datum.oceanBounds.min[1]),
  );
  assert.ok(swell < 3, `the sea swells ${swell} units, which reaches into the shore band`);
});

/** A sea that stops inside a frustum is a hole in the frame, not a residual. */
test("the sea covers every frozen camera frustum", () => {
  const coverage = geography.semanticSeaLevel.frustumCoverage;
  assert.equal(coverage.length, 6, `only ${coverage.length} frozen frusta were measured`);
  assert.deepEqual(
    coverage.filter((row) => !row.covered).map((row) => row.camera),
    [],
  );
  assert.equal(geography.semanticSeaLevel.allFrustaCovered, true);
});

/**
 * The authored sea animates: `Water`'s `time` uniform is advanced every frame.
 * Under the Frozen Observation Clock `performance.now()` is pinned, so the
 * reference's own delta is zero and it renders one repeatable phase. The
 * candidate has to reach the same repeatability by declaring the phase rather
 * than by reading a clock, because a runtime that generates from device state is
 * outside the Production Runtime boundary in the first place.
 */
test("the wave phase is declared and frozen, not read from a clock", async () => {
  assert.equal(
    typeof ocean.phase,
    "number",
    "the Environment Recipe declares no frozen wave phase",
  );
  assert.ok(Number.isFinite(ocean.phase));

  const source = await readFile(
    path.join(PROJECT_ROOT, "gt_designer/src/reconstruction/scene/material-families.js"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /performance\.now|Date\.now|requestAnimationFrame|Math\.random/,
    "the sea reads a clock or a random source",
  );
  // Two generations of the same recipe produce the same surface.
  const digest = () => {
    const { root } = generateScene(ISLAND_SCENE_RECIPE);
    let surface = null;
    root.traverse((child) => {
      if (child.userData?.semanticId === "environment/ocean-appearance-surface") surface = child;
    });
    assert.ok(surface, "the scene has no Ocean Appearance Surface");
    surface.updateMatrixWorld(true);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(surface.matrixWorld);
    assert.ok(
      normal.y > 0.999,
      `the sea faces ${normal.toArray().map((value) => value.toFixed(3))} rather than +Y`,
    );
    const uniforms = surface.material.uniforms ?? {};
    return JSON.stringify([
      Object.fromEntries(
        Object.entries(uniforms).map(([name, uniform]) => [
          name,
          uniform.value?.toArray?.() ?? uniform.value,
        ]),
      ),
      new THREE.Box3().setFromObject(surface).min.toArray(),
    ]);
  };
  assert.equal(digest(), digest(), "the sea is not identical across two generations");
});

/**
 * The sea is generated, not loaded. The reference's own surface samples
 * `waternormals.jpg`; reproducing it by fetching that file, by baking it into a
 * data URL, or by shipping the gradient it encodes as an array are all the same
 * violation.
 */
test("the sea loads nothing and carries no sampled gradient", async () => {
  const sources = await Promise.all(
    [
      "gt_designer/src/reconstruction/scene/material-families.js",
      "gt_designer/src/reconstruction/scene/scene-generator.js",
    ].map((relative) => readFile(path.join(PROJECT_ROOT, relative), "utf8")),
  );
  for (const source of sources) {
    assert.doesNotMatch(source, /waternormals|TextureLoader|\.load\(|fetch\(|data:image/);
  }

  // Compact: the whole surface is a parameter set, not a captured curve.
  const values = JSON.stringify(ocean).match(/-?\d+(\.\d+)?/g) ?? [];
  assert.ok(
    values.length <= 24,
    `the Ocean Appearance Surface carries ${values.length} numbers, which is a sampled gradient`,
  );
});

/**
 * Recorded when this ticket opened. The sea's appearance may not be bought with
 * the coastline: the terrain's land, shore, and sea classification is measured
 * against the same datum, and a surface that swallows the shore would improve
 * the sea's colour by deleting the boundary it is supposed to meet.
 */
const AT_TICKET_START = Object.freeze({
  classificationAgreement: 0.922721,
  coastlineSymmetricP95: 20.1984,
  coastlineAreaRelativeError: 0.035736,
});

test("the coastline and the land-and-sea classification did not regress", () => {
  assert.equal(geography.semanticSeaLevel.height, 16);
  assert.ok(
    geography.classification.agreementFraction >= AT_TICKET_START.classificationAgreement,
    `land and sea agreement fell to ${geography.classification.agreementFraction}`,
  );
  assert.ok(
    geography.coastline.symmetricDistance.p95 <= AT_TICKET_START.coastlineSymmetricP95,
    `coastline symmetric p95 rose to ${geography.coastline.symmetricDistance.p95}`,
  );
  assert.ok(
    geography.coastline.areaRelativeError <= AT_TICKET_START.coastlineAreaRelativeError,
    `coastline area error rose to ${geography.coastline.areaRelativeError}`,
  );
});
