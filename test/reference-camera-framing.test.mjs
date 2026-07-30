import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import {
  auditAuxiliaryFraming,
  createAuxiliaryFramingContract,
  farthestSubjectDistance,
  measureCloudShell,
  measureFramingSubject,
  measureSubjectCoverage,
  normalisedShellRadius,
} from "../tools/reference/camera-framing.mjs";
import { createReferenceObservationContract } from "../tools/reference/reference-observation-contract.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const readJson = (relative) =>
  readFile(path.join(PROJECT_ROOT, relative), "utf8").then(JSON.parse);

const EVIDENCE = ".scratch/scene-parity-foundation/evidence";

const CAMERA_SET_PATH = "tools/reference/baselines/reference-camera-set-v2.json";

async function loadEvidence() {
  const [passes, cameraSet] = await Promise.all([
    readJson(`${EVIDENCE}/scene-passes-v1.json`),
    readJson(CAMERA_SET_PATH),
  ]);
  return { recipe: ISLAND_SCENE_RECIPE, passes, cameraSet };
}

function framingInputs(recipe) {
  return {
    subject: measureFramingSubject({ recipe }),
    shell: measureCloudShell({ recipe }),
    fog: createReferenceObservationContract().renderContract.fog,
  };
}

test("the framing subject is the island, not the environment that surrounds it", () => {
  const subject = measureFramingSubject({ recipe: ISLAND_SCENE_RECIPE });
  const contract = createAuxiliaryFramingContract();

  for (const group of contract.subjectExclusions) {
    assert.ok(
      !subject.groups.includes(group),
      `${group} must not contribute to the framing subject`,
    );
  }
  assert.ok(subject.itemCount > 0);
  // The backdrop ridges reach past 1800 units on their own, so an island-sized
  // subject is the observable difference between framing the two.
  for (let axis = 0; axis < 3; axis += 1) {
    const span = subject.max[axis] - subject.min[axis];
    assert.ok(
      span < 1200,
      `framing subject axis ${axis} spans ${span}, which is environment-sized`,
    );
  }
});

test("an entity with no group cannot be silently dropped from the subject", () => {
  const recipe = {
    ...ISLAND_SCENE_RECIPE,
    entities: ISLAND_SCENE_RECIPE.entities.map((entity, index) =>
      index === 0 ? { ...entity, group: undefined } : entity,
    ),
  };
  assert.throws(() => measureFramingSubject({ recipe }), /declares no group/);
});

test("excluding the backdrop is what shrinks the subject", () => {
  const withBackdrop = measureFramingSubject({
    recipe: ISLAND_SCENE_RECIPE,
    contract: { ...createAuxiliaryFramingContract(), subjectExclusions: [] },
  });
  const subject = measureFramingSubject({ recipe: ISLAND_SCENE_RECIPE });

  assert.ok(withBackdrop.groups.includes("horizon"));
  assert.ok(
    withBackdrop.max[2] - withBackdrop.min[2] >
      3 * (subject.max[2] - subject.min[2]),
    "the backdrop must dominate the depth axis it is being excluded from",
  );
});

test("the cloud shell's unpopulated core is measured, not assumed", () => {
  const shell = measureCloudShell({ recipe: ISLAND_SCENE_RECIPE });
  const contract = createAuxiliaryFramingContract();

  assert.equal(shell.spriteCount, 34);
  // The contract's core radius has to stop short of where sprites actually
  // begin, otherwise "inside the core" would still be inside the population.
  assert.ok(
    shell.innermostPopulatedRadius >= contract.cloudShell.maximumNormalisedRadius,
    `sprites begin at ${shell.innermostPopulatedRadius}, inside the declared ` +
      `core radius ${contract.cloudShell.maximumNormalisedRadius}`,
  );
});

test("the authored overview satisfies the framing criteria it is the yardstick for", async () => {
  const { recipe, cameraSet } = await loadEvidence();

  // The authored composition demonstrably frames the island, so criteria that
  // reject it would be measuring the wrong thing.
  const failures = auditAuxiliaryFraming({
    cameraSet: { obliques: {}, authoredOverview: cameraSet.authoredOverview },
    ...framingInputs(recipe),
    includeAuthoredOverview: true,
  });
  assert.deepEqual(failures, []);
});

test("the framing audit rejects a camera pushed outside the atmosphere", async () => {
  const { recipe, cameraSet } = await loadEvidence();
  const overview = cameraSet.authoredOverview;

  const failures = auditAuxiliaryFraming({
    cameraSet: {
      obliques: {},
      authoredOverview: {
        ...overview,
        position: [overview.position[0], overview.position[1], overview.position[2] + 4000],
      },
    },
    ...framingInputs(recipe),
    includeAuthoredOverview: true,
  });
  assert.ok(
    failures.some((failure) => /exceeds the atmospheric limit/.test(failure)),
    `expected an atmospheric failure, got ${JSON.stringify(failures)}`,
  );
  assert.ok(
    failures.some((failure) => /populated cloud annulus/.test(failure)),
    `expected a cloud failure, got ${JSON.stringify(failures)}`,
  );
});

test("every frozen auxiliary camera stands where the island is measurable", async () => {
  const { recipe, cameraSet } = await loadEvidence();

  const failures = auditAuxiliaryFraming({ cameraSet, ...framingInputs(recipe) });
  assert.deepEqual(
    failures,
    [],
    `the frozen camera set cannot measure the island:\n  ${failures.join("\n  ")}`,
  );
});

test("every frozen camera actually carries island signal in the reference", async () => {
  const { recipe, passes } = await loadEvidence();
  const subject = measureFramingSubject({ recipe });

  const coverage = measureSubjectCoverage({ passes, subjectGroups: subject.groups });
  assert.deepEqual(
    coverage.failures,
    [],
    `the frozen camera set does not observe the island:\n  ${coverage.failures.join("\n  ")}`,
  );
});

test("whole-frame silhouette is environment agreement, not island evidence", async () => {
  const { passes } = await loadEvidence();
  const [width, height] = passes.capture.framebuffer;
  const frame = width * height;

  // Reframing the auxiliary cameras onto the island raised whole-frame
  // silhouette IoU from 0.900 to 0.994 while per-group IoU moved only from
  // 0.388 to 0.422, because the terrain and ocean planes fill most of every
  // auxiliary frame. Recorded here so the fixed-camera layer is calibrated on
  // per-group metrics in ticket 01, and so this is revisited rather than
  // assumed if the framing ever changes again.
  for (const view of passes.views) {
    if (view.camera === "authoredOverview") continue;
    const share = view.byGroup.geography.referencePixels / frame;
    assert.ok(
      share > 0.5,
      `${view.camera}: geography fills ${share} of the frame; if this no longer ` +
        "holds, re-examine whether whole-frame silhouette carries island signal",
    );
  }
  assert.ok(
    passes.aggregate.silhouetteIoU.mean >
      passes.aggregate.groupSilhouetteIoU.mean + 0.4,
    "whole-frame silhouette must stay recorded as far more optimistic than per-group",
  );
});

test("coverage is measured from reference pixels alone", async () => {
  const { recipe, passes } = await loadEvidence();
  const subject = measureFramingSubject({ recipe });

  // Rewriting every candidate pixel count must not move the measurement, or
  // the camera set's adequacy would depend on the thing it is meant to judge.
  const tampered = {
    ...passes,
    views: passes.views.map((view) => ({
      ...view,
      byGroup: Object.fromEntries(
        Object.entries(view.byGroup ?? {}).map(([group, entry]) => [
          group,
          { ...entry, candidatePixels: 0 },
        ]),
      ),
    })),
  };
  assert.deepEqual(
    measureSubjectCoverage({ passes: tampered, subjectGroups: subject.groups }).cameras,
    measureSubjectCoverage({ passes, subjectGroups: subject.groups }).cameras,
  );
});

test("subject distance and shell radius are plain geometry", () => {
  const subject = { min: [-10, 0, -10], max: [10, 4, 10] };
  assert.equal(farthestSubjectDistance([0, 0, 0], subject), 14.696938457);
  const shell = { center: [0, 0], radii: [100, 50] };
  assert.equal(normalisedShellRadius([50, 0, 0], shell), 0.5);
  assert.equal(normalisedShellRadius([0, 0, 25], shell), 0.5);
  assert.equal(normalisedShellRadius([0, 0, 0], shell), 0);
});
