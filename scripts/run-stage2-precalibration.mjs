import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import { selectStage2CategoryBaselines } from "../tools/evaluation/stage2-precalibration-contract.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const OBJECT_IDS = Object.freeze([
  "bamboo-shoot",
  "mushroom",
  "blue-hat",
  "candle",
]);
const REPORT_PATH = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/reports/stage2-precalibration-v1.json",
);
const BASELINE_PATH = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/baselines/stage2-category-baselines-v1.json",
);

async function main() {
  const check = process.argv.slice(2).includes("--check");
  const runs = [];
  for (let objectIndex = 0; objectIndex < OBJECT_IDS.length; objectIndex += 1) {
    const objectId = OBJECT_IDS[objectIndex];
    for (let runIndex = 1; runIndex <= 2; runIndex += 1) {
      process.stdout.write(`Stage 2 pre-calibration: ${objectId} run ${runIndex}/2\n`);
      const automation = await runLocalSceneAutomation({
        label: `stage2-pre-${objectId}-${runIndex}`,
        serverFlag: "--evaluation",
        path: "/single-mesh-evaluation/",
        query: `?calibrate=stage2-pre&unit=${encodeURIComponent(objectId)}&run=${runIndex}`,
        readyState: {
          state: "stage2-precalibrated",
          objectId,
          calibrationRun: String(runIndex),
        },
        probeExpression: `({
          state: document.body?.dataset?.state ?? null,
          objectId: document.body?.dataset?.objectId ?? null,
          calibrationRun: document.body?.dataset?.calibrationRun ?? null,
          error: window.singleMeshEvaluation?.error ?? null,
          statusText: document.querySelector("#state")?.textContent ?? null,
          report: window.singleMeshEvaluation?.stage2PrecalibrationRun ?? null
        })`,
        timeoutMs: 300_000,
        port: 8500 + objectIndex * 10 + runIndex,
      });
      runs.push(automation.state.report);
    }
  }
  const baseline = selectStage2CategoryBaselines(runs);
  const checks = [
    {
      id: "two-independent-reference-only-runs-per-object",
      passed: baseline.objectIds.every((objectId) =>
        runs.filter((run) => run.objectId === objectId).length === 2
      ),
    },
    {
      id: "all-category-brackets-separated",
      passed: baseline.frozen,
      detail: baseline.failures,
    },
    {
      id: "candidates-excluded-before-freeze",
      passed: runs.every((run) => run.candidateUse === "prohibited"),
    },
    {
      id: "four-independent-budgets-frozen",
      passed: Object.values(baseline.objects).every(
        (object) => object.frozen && object.budget,
      ),
    },
  ];
  const report = {
    schemaVersion: "stage-2-precalibration-evidence-v1",
    artifactRole: "development-only-reference-precalibration-evidence",
    productionUse: "prohibited",
    baselineVersion: baseline.version,
    runs,
    acceptance: {
      passed: checks.every(({ passed }) => passed),
      checks,
      failures: checks.filter(({ passed }) => !passed),
    },
  };
  if (!report.acceptance.passed) {
    await mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    throw new Error(`Stage 2 pre-calibration failed: ${JSON.stringify(report.acceptance.failures)}`);
  }
  if (check) {
    const [frozenReport, frozenBaseline] = await Promise.all([
      readFile(REPORT_PATH, "utf8").then(JSON.parse),
      readFile(BASELINE_PATH, "utf8").then(JSON.parse),
    ]);
    if (
      frozenReport.schemaVersion !== report.schemaVersion ||
      frozenBaseline.version !== baseline.version ||
      frozenBaseline.frozen !== true
    ) {
      throw new Error("frozen Stage 2 pre-calibration identity differs");
    }
  } else {
    await mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await Promise.all([
      writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`),
      writeFile(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`),
    ]);
  }
  process.stdout.write("Stage 2 pre-calibration: PASS (4 baselines, 4 budgets)\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
