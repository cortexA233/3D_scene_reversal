import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import { verifyCandidateFreeze } from "../tools/evaluation/candidate-freeze.mjs";
import {
  evaluateStoneGeometryV2Gate,
  selectStoneGeometryV2Thresholds,
  stoneGeometryV2CalibrationContractDefinition,
  validateStoneGeometryV2Run,
} from "../tools/evaluation/stone-v2-calibration-contract.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REPORT_OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/reports/stone-geometry-v2-calibration.json",
);
const BASELINE_OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/baselines/stone-geometry-baseline-v2.json",
);
const CONTRACT_OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/baselines/stone-geometry-v2-calibration-contract.json",
);
const CANDIDATE_OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/baselines/stone-v2-candidate-freeze.json",
);

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${stable(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function crossRunEvidence(run) {
  return {
    referenceCaptureChecksums: run.referenceCaptureChecksums,
    identity: run.identity,
    scenarios: run.scenarios.map((scenario) => ({
      id: scenario.id,
      aggregate: scenario.aggregate,
      captureChecksums: scenario.captureChecksums,
    })),
  };
}

function identityPassed(run) {
  const geometry = run.identity.comparison.aggregate.geometry;
  return (
    geometry.bounds.maxAxisRelativeError <= 1e-9 &&
    geometry.bounds.bottomAnchorErrorCanonical <= 1e-9 &&
    geometry.silhouette.meanIou === 1 &&
    geometry.silhouette.worstViewIou === 1 &&
    geometry.silhouette.meanEdgeDistancePixels === 0 &&
    geometry.silhouette.edgeDistanceP95Pixels === 0 &&
    geometry.depth.mae <= 1e-6 &&
    geometry.depth.p95 === 0
  );
}

async function main() {
  const contract = stoneGeometryV2CalibrationContractDefinition();
  const frozenContract = JSON.parse(await readFile(CONTRACT_OUTPUT, "utf8"));
  const candidateManifest = JSON.parse(await readFile(CANDIDATE_OUTPUT, "utf8"));
  const candidateBefore = await verifyCandidateFreeze({
    projectRoot: PROJECT_ROOT,
    manifest: candidateManifest,
  });
  if (!candidateBefore.passed) {
    throw new Error(`candidate quarantine failed before calibration: ${JSON.stringify(candidateBefore.failures)}`);
  }

  const runnerSource = await readFile(
    path.join(
      PROJECT_ROOT,
      "gt_designer/single-mesh-evaluation/stone-v2-calibration-runner.js",
    ),
    "utf8",
  );
  const mainSource = await readFile(
    path.join(PROJECT_ROOT, "gt_designer/single-mesh-evaluation/main.js"),
    "utf8",
  );
  const isolatedCalibrationModule =
    !/src\/reconstruction|reports\/stone|stone-recipe|stone-generator/.test(
      runnerSource,
    ) && !/^import .*src\/reconstruction/m.test(mainSource);

  const runs = [];
  for (let runIndex = 1; runIndex <= contract.capturePolicy.independentRuns; runIndex += 1) {
    process.stdout.write(`Stone Geometry Baseline v2: reference run ${runIndex}/2\n`);
    const automation = await runLocalSceneAutomation({
      label: `stone-v2-reference-calibration-${runIndex}`,
      serverFlag: "--evaluation",
      path: "/single-mesh-evaluation/",
      query: `?calibrate=stone-v2&run=${runIndex}`,
      readyState: {
        state: "stone-v2-calibrated",
        calibrationRun: String(runIndex),
      },
      probeExpression: `({
        state: document.body?.dataset?.state ?? null,
        calibrationRun: document.body?.dataset?.calibrationRun ?? null,
        statusText: document.querySelector('#state')?.textContent ?? null,
        run: window.singleMeshEvaluation?.stoneV2CalibrationRun ?? null
      })`,
      timeoutMs: 300_000,
      port: 8420 + runIndex,
    });
    if (!automation.state.run) {
      throw new Error(`Stone v2 browser run ${runIndex} returned no report`);
    }
    runs.push(automation.state.run);
  }

  const runValidations = runs.map((run) =>
    validateStoneGeometryV2Run({ contract, run }),
  );
  const selection = selectStoneGeometryV2Thresholds({ contract, runs });
  const baseline = {
    schemaVersion: "stone-geometry-quality-baseline-v2",
    version: contract.baselineVersion,
    objectId: "stone",
    artifactRole: "development-only-quality-baseline",
    productionUse: "prohibited",
    contractSchemaVersion: contract.schemaVersion,
    selectionStrategy: contract.thresholdSelection.strategy,
    hard: selection.hard,
    diagnostic: selection.diagnostic,
    frozen: true,
  };
  const mustRejectChecks = contract.scenarios
    .filter((scenario) => scenario.mustReject)
    .map((scenario) => ({
      scenarioId: scenario.id,
      passed: runs.every((run) => {
        const evidence = run.scenarios.find(({ id }) => id === scenario.id);
        return !evaluateStoneGeometryV2Gate({
          baseline,
          aggregate: evidence.aggregate,
        }).passed;
      }),
    }));
  const candidateAfter = await verifyCandidateFreeze({
    projectRoot: PROJECT_ROOT,
    manifest: candidateManifest,
  });
  const checks = [
    {
      id: "frozen-contract-matches-source",
      passed: stable(frozenContract) === stable(contract),
    },
    {
      id: "candidate-quarantine-before-and-after",
      passed: candidateBefore.passed && candidateAfter.passed,
      detail: [...candidateBefore.failures, ...candidateAfter.failures],
    },
    {
      id: "candidate-free-calibration-module",
      passed: isolatedCalibrationModule,
    },
    {
      id: "two-valid-reference-only-runs",
      passed: runValidations.every((validation) => validation.passed),
      detail: runValidations,
    },
    {
      id: "identity-copy-is-exact",
      passed: runs.every(identityPassed),
    },
    {
      id: "cross-run-evidence-stable",
      passed: stable(crossRunEvidence(runs[0])) === stable(crossRunEvidence(runs[1])),
    },
    {
      id: "mild-destructive-separation",
      passed: selection.passed,
      detail: selection.groupFailures,
    },
    {
      id: "all-must-reject-controls-fail",
      passed: mustRejectChecks.every((check) => check.passed),
      detail: mustRejectChecks,
    },
  ];
  const report = {
    schemaVersion: "stone-geometry-v2-calibration-report-v1",
    artifactRole: "development-only-authored-reference-calibration",
    productionUse: "prohibited",
    objectId: "stone",
    candidateFreeze: candidateManifest,
    contract,
    runs,
    thresholdSelection: selection,
    proposedBaseline: baseline,
    acceptance: {
      passed: checks.every((check) => check.passed),
      checks,
      failures: checks.filter((check) => !check.passed),
    },
  };
  await mkdir(path.dirname(REPORT_OUTPUT), { recursive: true });
  await writeFile(REPORT_OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.acceptance.passed) {
    throw new Error(
      `Stone v2 calibration failed: ${report.acceptance.failures.map(({ id }) => id).join(", ")}`,
    );
  }
  await writeFile(BASELINE_OUTPUT, `${JSON.stringify(baseline, null, 2)}\n`);
  process.stdout.write(
    `Stone Geometry Baseline v2: PASS (${baseline.hard.length} hard, ${baseline.diagnostic.length} diagnostic)\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
