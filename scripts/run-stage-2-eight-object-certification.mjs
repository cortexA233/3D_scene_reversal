import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import {
  createEightObjectLabAssembly,
  EIGHT_OBJECT_LAB_LAYOUT_VERSION,
  EIGHT_OBJECT_LAB_PLACEMENTS,
} from "../gt_designer/src/reconstruction/stage-1-5-layout.js";
import { EIGHT_SLOT_LAB_REFERENCE_LAYOUT } from "../gt_designer/src/reconstruction/eight-slot-lab-layout.js";
import { verifyCandidateFreeze } from "../tools/evaluation/candidate-freeze.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/reports/stage-2-eight-object-certification-v2.json",
);
const OBJECTS = Object.freeze([
  {
    objectId: "stone-path",
    acceptance: "stone-path-acceptance-v1.json",
    geometry: "single-mesh-quality-baseline-v1",
    appearance: "single-mesh-quality-baseline-v1",
    native: "qualifier",
  },
  {
    objectId: "stone",
    acceptance: "stone-acceptance-v3.json",
    geometry: "stone-geometry-baseline-v2",
    appearance: "single-mesh-quality-baseline-v1",
    native: "stone-geometry-v2-native-gpu",
  },
  {
    objectId: "bamboo-shoot",
    acceptance: "bamboo-shoot-acceptance-v2.json",
    geometry: "bamboo-shoot-category-baseline-v1",
    appearance: "bamboo-shoot-semantic-category-baseline-v2",
    native: "bamboo-shoot-native-gpu-v2",
  },
  {
    objectId: "blue-hat",
    acceptance: "blue-hat-acceptance-v2.json",
    geometry: "blue-hat-category-baseline-v1",
    appearance: "blue-hat-semantic-category-baseline-v2",
    native: "blue-hat-native-gpu-v2",
  },
  {
    objectId: "vase",
    acceptance: "vase-acceptance-v1.json",
    geometry: "single-mesh-quality-baseline-v1",
    appearance: "single-mesh-quality-baseline-v1",
    native: "qualifier",
  },
  {
    objectId: "candle",
    acceptance: "candle-acceptance-v3.json",
    geometry: "candle-category-baseline-v1",
    appearance: "candle-semantic-category-baseline-v2",
    native: "candle-native-gpu-v3",
  },
  {
    objectId: "mushroom",
    acceptance: "mushroom-acceptance-v2.json",
    geometry: "mushroom-compact-geometry-baseline-v2",
    appearance: "mushroom-semantic-category-baseline-v2",
    native: "mushroom-native-gpu-v2",
  },
  {
    objectId: "umbrella",
    acceptance: "umbrella-acceptance-v4.json",
    geometry: "single-mesh-quality-baseline-v1",
    appearance: "patterned-appearance-baseline-v3",
    native: "umbrella-native-gpu-v3",
  },
]);
const FREEZES = Object.freeze([
  "stone-v2-candidate-freeze.json",
  "umbrella-v3-approved-candidate-freeze.json",
  "bamboo-shoot-v2-approved-candidate-freeze.json",
  "mushroom-v2-approved-candidate-freeze.json",
  "blue-hat-v2-approved-candidate-freeze.json",
  "candle-v3-approved-candidate-freeze.json",
]);
const COMPLEX_CONTROLS = Object.freeze([
  "patterned-appearance-v3-human-anchor.json",
  "bamboo-shoot-semantic-appearance-v2-controls.json",
  "mushroom-semantic-appearance-v2-controls.json",
  "blue-hat-semantic-appearance-v2-controls.json",
  "candle-semantic-appearance-v3-controls.json",
]);

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(PROJECT_ROOT, relativePath), "utf8"));
}

function gateVersions(report) {
  const gate = report.visual?.comparison?.gate;
  return gate?.baselineVersions ?? {
    geometry: gate?.baselineVersion,
    appearance: gate?.baselineVersion,
  };
}

function nativeObjectPassed(report, objectId) {
  const object = report.objects?.find((entry) => entry.objectId === objectId);
  return report.acceptance?.passed === true &&
    object?.acceptance?.passed === true &&
    object.runs?.length === 2 &&
    object.runs.every((run) =>
      run.headless === false &&
      run.softwareRenderingRequested === false &&
      run.report?.environment?.gpu?.hardwareAccelerated === true
    );
}

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : object.material ? [object.material] : [];
    materials.forEach((material) => material.dispose());
  });
}

async function main() {
  const check = process.argv.slice(2).includes("--check");
  const reportRoot = "gt_designer/single-mesh-evaluation/reports";
  const baselineRoot = "gt_designer/single-mesh-evaluation/baselines";
  const [stage1, stage15, ...acceptanceReports] = await Promise.all([
    readJson(`${reportRoot}/stage-1-certification-v1.json`),
    readJson(`${reportRoot}/stage-1-5-v3-certification.json`),
    ...OBJECTS.map((object) => readJson(`${reportRoot}/${object.acceptance}`)),
  ]);
  const nativeCache = new Map();
  async function native(browser, key) {
    const file = key === "qualifier"
      ? `${browser}-native-gpu-gates-v1.json`
      : `${browser}-${key}.json`;
    const cacheKey = `${browser}/${file}`;
    if (!nativeCache.has(cacheKey)) {
      nativeCache.set(cacheKey, await readJson(`${reportRoot}/${file}`));
    }
    return nativeCache.get(cacheKey);
  }
  const nativeEvidence = await Promise.all(OBJECTS.map(async (object) => ({
    objectId: object.objectId,
    firefox: nativeObjectPassed(await native("firefox", object.native), object.objectId),
    safari: nativeObjectPassed(await native("safari", object.native), object.objectId),
  })));
  const controlReports = await Promise.all(
    COMPLEX_CONTROLS.map((file) => readJson(`${reportRoot}/${file}`)),
  );
  const materialAliasing = await readJson(
    `${reportRoot}/candle-material-aliasing-v1.json`,
  );
  const freezeChecks = await Promise.all(FREEZES.map(async (file) => {
    const manifest = await readJson(`${baselineRoot}/${file}`);
    return {
      candidateId: manifest.candidateId,
      ...(await verifyCandidateFreeze({ projectRoot: PROJECT_ROOT, manifest })),
    };
  }));

  const assembly = createEightObjectLabAssembly();
  let layoutEvidence;
  try {
    layoutEvidence = assembly.entries.map(({ placement, root }) => {
      const bounds = new THREE.Box3().setFromObject(root);
      const size = bounds.getSize(new THREE.Vector3());
      return {
        objectId: placement.objectId,
        slotPosition: placement.position,
        transformPosition: root.position.toArray(),
        displayScale: placement.displayScale,
        displayedLargestDimension: Math.max(size.x, size.y, size.z),
        bottomCenter: [
          (bounds.min.x + bounds.max.x) * 0.5,
          bounds.min.y,
          (bounds.min.z + bounds.max.z) * 0.5,
        ],
      };
    });
  } finally {
    dispose(assembly.root);
  }
  const layoutIds = layoutEvidence.map(({ objectId }) => objectId);
  const expectedIds = EIGHT_SLOT_LAB_REFERENCE_LAYOUT.slots.map(({ id }) => id);
  const layoutMatches = JSON.stringify(layoutIds) === JSON.stringify(expectedIds) &&
    layoutEvidence.every(({ slotPosition, bottomCenter, displayedLargestDimension }) =>
      slotPosition.every((value, index) => Math.abs(value - bottomCenter[index]) < 1e-5) &&
      Math.abs(displayedLargestDimension - EIGHT_SLOT_LAB_REFERENCE_LAYOUT.canonicalMaxDimension) < 0.5
    );
  const runtimeSources = await Promise.all([
    readFile(path.join(PROJECT_ROOT, "gt_designer/stage-1-5-scene/main.js"), "utf8"),
    readFile(path.join(PROJECT_ROOT, "gt_designer/src/reconstruction/stage-1-5-layout.js"), "utf8"),
  ]);
  const authoredRuntimePattern = /GLTFLoader|island-village\.glb|sourceNode|Authored Reference asset/;

  const objectEvidence = OBJECTS.map((object, index) => {
    const acceptance = acceptanceReports[index];
    const versions = gateVersions(acceptance);
    return {
      objectId: object.objectId,
      geometryBaseline: versions.geometry,
      appearanceBaseline: versions.appearance,
      chromeAcceptancePassed: acceptance.acceptance?.passed === true,
      nonvisualAcceptancePassed: acceptance.nonvisual?.acceptance?.passed === true,
      firefoxNativeGpuPassed: nativeEvidence[index].firefox,
      safariNativeGpuPassed: nativeEvidence[index].safari,
      expectedVersionsMatch:
        versions.geometry === object.geometry && versions.appearance === object.appearance,
    };
  });
  const checks = [
    {
      id: "historical-stage-1-retained-as-two-of-four-fail",
      passed:
        stage1.certification?.passed === false &&
        stage1.certification?.passedObjectCount === 2 &&
        stage1.certification?.requiredObjectCount === 4,
    },
    {
      id: "stage-1-5-authorized-stage-2-without-eight-object-claim",
      passed:
        stage15.certification?.passed === true &&
        stage15.certification?.stage2Authorized === true &&
        stage15.certification?.formalEightObjectExitClaimed === false,
    },
    {
      id: "eight-versioned-object-acceptances",
      passed: objectEvidence.length === 8 && objectEvidence.every((object) =>
        object.chromeAcceptancePassed &&
        object.nonvisualAcceptancePassed &&
        object.expectedVersionsMatch
      ),
    },
    {
      id: "eight-firefox-and-safari-native-hardware-gpu-gates",
      passed: nativeEvidence.every((object) => object.firefox && object.safari),
    },
    {
      id: "all-complex-appearance-damage-controls-reject",
      passed: controlReports.every((report) => report.acceptance?.passed === true),
    },
    {
      id: "candle-multiscale-material-aliasing-gate",
      passed:
        materialAliasing.objectId === "candle" &&
        materialAliasing.acceptance?.passed === true,
    },
    {
      id: "all-versioned-positive-candidate-freezes-current",
      passed: freezeChecks.every((freeze) => freeze.passed === true),
    },
    {
      id: "unified-eight-slot-lab-reference-layout",
      passed:
        EIGHT_OBJECT_LAB_LAYOUT_VERSION === "stage-2-eight-object-lab-layout-v1" &&
        EIGHT_OBJECT_LAB_PLACEMENTS.length === 8 &&
        layoutMatches,
    },
    {
      id: "single-procedural-final-scene-without-authored-runtime-assets",
      passed: runtimeSources.every((source) => !authoredRuntimePattern.test(source)),
    },
  ];
  const passed = checks.every((entry) => entry.passed);
  const report = {
    schemaVersion: "single-mesh-stage-2-eight-object-certification-v2",
    artifactRole: "development-only-versioned-category-exit-certification",
    productionUse: "prohibited",
    result: passed
      ? "PASS under versioned category-specific baselines (8/8)"
      : "FAIL under versioned category-specific baselines",
    historicalStage1: {
      result: "2/4 FAIL",
      rewritten: false,
      sourceSchemaVersion: stage1.schemaVersion,
    },
    previousStage2Certification: {
      schemaVersion: "single-mesh-stage-2-eight-object-certification-v1",
      preserved: true,
    },
    delivery: {
      kind: "Reference-layout Delivery",
      route: "/stage-1-5-scene/",
      layoutVersion: EIGHT_OBJECT_LAB_LAYOUT_VERSION,
      objectCount: layoutEvidence.length,
      isolatedPerObjectFinalScenes: false,
      fullIslandClaimed: false,
      authoredReferenceRuntimeAssets: false,
      placements: layoutEvidence,
    },
    acceptedObjects: objectEvidence,
    complexAppearanceControls: controlReports.map((control) => ({
      objectId: control.objectId,
      schemaVersion: control.schemaVersion,
      passed: control.acceptance.passed,
    })),
    materialAliasing: {
      objectId: materialAliasing.objectId,
      schemaVersion: materialAliasing.schemaVersion,
      passed: materialAliasing.acceptance.passed,
      aggregate: materialAliasing.scaleConsistency.aggregate,
    },
    candidateFreezes: freezeChecks.map((freeze) => ({
      candidateId: freeze.candidateId,
      passed: freeze.passed,
    })),
    certification: {
      passed,
      formalEightObjectExitClaimed: passed,
      formalFullIslandExitClaimed: false,
      checks,
      failures: checks.filter((entry) => !entry.passed),
    },
  };
  if (!passed) {
    throw new Error(`Stage 2 eight-object certification failed: ${JSON.stringify(report.certification.failures)}`);
  }
  if (check) {
    const frozen = await readJson(path.relative(PROJECT_ROOT, OUTPUT));
    if (
      frozen.schemaVersion !== report.schemaVersion ||
      frozen.result !== report.result ||
      frozen.certification?.formalEightObjectExitClaimed !== true
    ) {
      throw new Error("frozen Stage 2 eight-object certification identity differs");
    }
  } else {
    await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  }
  process.stdout.write(`${report.result}; unified Lab scene certified\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
