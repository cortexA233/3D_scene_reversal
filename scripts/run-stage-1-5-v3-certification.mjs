import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/reports/stage-1-5-v3-certification.json",
);

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(path.join(PROJECT_ROOT, relativePath), "utf8"),
  );
}

function nativeObjectPassed(report, objectId) {
  return report.acceptance?.passed === true && report.objects?.some(
    (object) => object.objectId === objectId && object.acceptance?.passed === true,
  );
}

async function main() {
  const check = process.argv.slice(2).includes("--check");
  const [
    stage1,
    stone,
    umbrella,
    patternedV3,
    firefoxQualifiers,
    safariQualifiers,
    firefoxStone,
    safariStone,
    firefoxUmbrella,
    safariUmbrella,
    precalibration,
    stage2Baselines,
  ] = await Promise.all([
    readJson("gt_designer/single-mesh-evaluation/reports/stage-1-certification-v1.json"),
    readJson("gt_designer/single-mesh-evaluation/reports/stone-acceptance-v3.json"),
    readJson("gt_designer/single-mesh-evaluation/reports/umbrella-acceptance-v4.json"),
    readJson("gt_designer/single-mesh-evaluation/reports/patterned-appearance-v3-human-anchor.json"),
    readJson("gt_designer/single-mesh-evaluation/reports/firefox-native-gpu-gates-v1.json"),
    readJson("gt_designer/single-mesh-evaluation/reports/safari-native-gpu-gates-v1.json"),
    readJson("gt_designer/single-mesh-evaluation/reports/firefox-stone-geometry-v2-native-gpu.json"),
    readJson("gt_designer/single-mesh-evaluation/reports/safari-stone-geometry-v2-native-gpu.json"),
    readJson("gt_designer/single-mesh-evaluation/reports/firefox-umbrella-native-gpu-v3.json"),
    readJson("gt_designer/single-mesh-evaluation/reports/safari-umbrella-native-gpu-v3.json"),
    readJson("gt_designer/single-mesh-evaluation/reports/stage2-precalibration-v1.json"),
    readJson("gt_designer/single-mesh-evaluation/baselines/stage2-category-baselines-v1.json"),
  ]);
  const checks = [
    {
      id: "historical-stage-1-retained-as-two-of-four-fail",
      passed:
        stage1.certification?.passed === false &&
        stage1.certification?.passedObjectCount === 2 &&
        stage1.certification?.requiredObjectCount === 4,
    },
    {
      id: "stone-v2-complete-acceptance",
      passed: stone.acceptance?.passed === true,
    },
    {
      id: "umbrella-v3-complete-acceptance",
      passed:
        umbrella.acceptance?.passed === true &&
        umbrella.visual?.comparison?.gate?.baselineVersions?.appearance ===
          "patterned-appearance-baseline-v3",
    },
    {
      id: "patterned-v3-positive-and-destructive-bracket",
      passed: patternedV3.acceptance?.passed === true,
    },
    {
      id: "native-firefox-and-safari-qualified",
      passed:
        firefoxQualifiers.qualification?.passed === true &&
        safariQualifiers.qualification?.passed === true,
    },
    {
      id: "stone-native-three-browser-boundary",
      passed:
        nativeObjectPassed(firefoxStone, "stone") &&
        nativeObjectPassed(safariStone, "stone"),
    },
    {
      id: "umbrella-native-three-browser-boundary",
      passed:
        nativeObjectPassed(firefoxUmbrella, "umbrella") &&
        nativeObjectPassed(safariUmbrella, "umbrella"),
    },
    {
      id: "four-stage-2-reference-only-baselines-and-budgets-frozen",
      passed:
        precalibration.acceptance?.passed === true &&
        stage2Baselines.frozen === true &&
        stage2Baselines.objectIds?.length === 4 &&
        Object.values(stage2Baselines.objects ?? {}).every(
          (object) => object.frozen === true && object.budget,
        ),
    },
  ];
  const report = {
    schemaVersion: "single-mesh-stage-1-5-v3-certification-v1",
    artifactRole: "development-only-stage-boundary-certification",
    productionUse: "prohibited",
    historicalStage1: {
      result: "2/4 FAIL",
      rewritten: false,
      sourceSchemaVersion: stage1.schemaVersion,
    },
    acceptedVersionedObjects: [
      { objectId: "stone-path", baseline: "single-mesh-quality-baseline-v1" },
      { objectId: "stone", baseline: "stone-geometry-baseline-v2" },
      { objectId: "vase", baseline: "single-mesh-quality-baseline-v1" },
      { objectId: "umbrella", baseline: "patterned-appearance-baseline-v3" },
    ],
    prefittedStage2Baselines: Object.fromEntries(
      Object.entries(stage2Baselines.objects).map(([objectId, object]) => [
        objectId,
        { baseline: object.version, budget: object.budget },
      ]),
    ),
    certification: {
      passed: checks.every(({ passed }) => passed),
      stage2Authorized: checks.every(({ passed }) => passed),
      formalEightObjectExitClaimed: false,
      checks,
      failures: checks.filter(({ passed }) => !passed),
    },
  };
  if (!report.certification.passed) {
    throw new Error(`Stage 1.5 v3 certification failed: ${JSON.stringify(report.certification.failures)}`);
  }
  if (check) {
    const frozen = JSON.parse(await readFile(OUTPUT, "utf8"));
    if (
      frozen.schemaVersion !== report.schemaVersion ||
      frozen.certification?.stage2Authorized !== true
    ) {
      throw new Error("frozen Stage 1.5 v3 certification identity differs");
    }
  } else {
    await mkdir(path.dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  }
  process.stdout.write("Stage 1.5 v3 certification: PASS; Stage 2 authorized\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
