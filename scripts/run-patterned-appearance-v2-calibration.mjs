import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import { verifyCandidateFreeze } from "../tools/evaluation/candidate-freeze.mjs";
import {
  evaluatePatternedAppearanceV2Gate,
  patternedAppearanceV2CalibrationContractDefinition,
  selectPatternedAppearanceV2Thresholds,
  validatePatternedAppearanceV2Run,
} from "../tools/evaluation/patterned-appearance-v2-contract.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REPORT_OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/reports/patterned-appearance-v2-calibration.json",
);
const BASELINE_OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/baselines/patterned-appearance-baseline-v2.json",
);
const CONTRACT_OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/baselines/patterned-appearance-v2-calibration-contract.json",
);
const SNAPSHOT_OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/baselines/umbrella-v2-precalibration-snapshot.json",
);
const CALIBRATION_SOURCE_PATHS = Object.freeze([
  "gt_designer/single-mesh-evaluation/patterned-appearance-v2-calibration-runner.js",
  "tools/evaluation/patterned-appearance-metrics.mjs",
  "tools/evaluation/patterned-appearance-v2-contract.mjs",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

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
      mutationEvidence: scenario.mutationEvidence,
      aggregate: scenario.aggregate,
      captureChecksums: scenario.captureChecksums,
    })),
  };
}

function identityPassed(run, contract) {
  const appearance = run.identity.comparison.aggregate.appearance;
  const tolerance = contract.identityTolerance;
  return (
    appearance.meanDeltaE00 <= tolerance.meanDeltaE00Maximum &&
    appearance.p90DeltaE00 <= tolerance.p90DeltaE00Maximum &&
    appearance.meanMaskedSsim >= tolerance.meanMaskedSsimMinimum &&
    appearance.worstViewSsim >= tolerance.worstViewSsimMinimum &&
    appearance.paletteCentroidDeltaE00 <=
      tolerance.paletteCentroidDeltaE00Maximum &&
    appearance.paletteCoverageL1 <= tolerance.paletteCoverageL1Maximum &&
    appearance.roughnessAbsoluteError <=
      tolerance.roughnessAbsoluteErrorMaximum &&
    appearance.metalnessAbsoluteError <=
      tolerance.metalnessAbsoluteErrorMaximum
  );
}

async function main() {
  const contract = patternedAppearanceV2CalibrationContractDefinition();
  const frozenContract = JSON.parse(await readFile(CONTRACT_OUTPUT, "utf8"));
  const candidateSnapshot = JSON.parse(await readFile(SNAPSHOT_OUTPUT, "utf8"));
  const candidateBefore = await verifyCandidateFreeze({
    projectRoot: PROJECT_ROOT,
    manifest: candidateSnapshot,
  });
  if (!candidateBefore.passed) {
    throw new Error(
      `Umbrella calibration quarantine failed before capture: ${JSON.stringify(candidateBefore.failures)}`,
    );
  }
  const calibrationSources = await Promise.all(
    CALIBRATION_SOURCE_PATHS.map(async (relativePath) => {
      const bytes = await readFile(path.join(PROJECT_ROOT, relativePath));
      return {
        path: relativePath,
        byteLength: bytes.byteLength,
        sha256: sha256(bytes),
        source: bytes.toString("utf8"),
      };
    }),
  );
  const candidateFreeCalibration = calibrationSources.every(
    ({ source }) =>
      !/src\/reconstruction|umbrella-generator|umbrella-recipe|reports\/umbrella|single-mesh-runtime-audit/.test(
        source,
      ),
  );

  const runs = [];
  for (
    let runIndex = 1;
    runIndex <= contract.capturePolicy.independentRuns;
    runIndex += 1
  ) {
    process.stdout.write(
      `Patterned Appearance Baseline v2: reference run ${runIndex}/2\n`,
    );
    const automation = await runLocalSceneAutomation({
      label: `patterned-appearance-v2-reference-${runIndex}`,
      serverFlag: "--evaluation",
      path: "/single-mesh-evaluation/",
      query: `?calibrate=patterned-appearance-v2&run=${runIndex}`,
      readyState: {
        state: "patterned-appearance-v2-calibrated",
        calibrationRun: String(runIndex),
      },
      probeExpression: `({
        state: document.body?.dataset?.state ?? null,
        calibrationRun: document.body?.dataset?.calibrationRun ?? null,
        statusText: document.querySelector('#state')?.textContent ?? null,
        run: window.singleMeshEvaluation?.patternedAppearanceV2CalibrationRun ?? null
      })`,
      timeoutMs: 300_000,
      port: 8430 + runIndex,
    });
    if (!automation.state.run) {
      throw new Error(`Patterned appearance browser run ${runIndex} returned no report`);
    }
    runs.push(automation.state.run);
  }

  const runValidations = runs.map((run) =>
    validatePatternedAppearanceV2Run({ contract, run }),
  );
  const selection = selectPatternedAppearanceV2Thresholds({ contract, runs });
  const baseline = {
    schemaVersion: "patterned-appearance-quality-baseline-v2",
    version: contract.baselineVersion,
    objectId: "umbrella",
    artifactRole: "development-only-quality-baseline",
    productionUse: "prohibited",
    contractSchemaVersion: contract.schemaVersion,
    selectionStrategy: contract.thresholdSelection.strategy,
    hard: selection.hard,
    diagnostic: selection.diagnostic,
    frozen: true,
  };
  const scenarios = contract.scenarios.map((definition) => ({
    scenarioId: definition.id,
    classification: definition.classification,
    runs: runs.map((run) => {
      const evidence = run.scenarios.find(({ id }) => id === definition.id);
      return {
        passed: evaluatePatternedAppearanceV2Gate({
          baseline,
          aggregate: evidence.aggregate,
        }).passed,
        aggregate: evidence.aggregate,
      };
    }),
  }));
  const shouldPassChecks = scenarios
    .filter(({ classification }) => classification === "should-pass")
    .map((scenario) => ({
      scenarioId: scenario.scenarioId,
      passed: scenario.runs.every((run) => run.passed),
    }));
  const mustRejectChecks = scenarios
    .filter(({ classification }) => classification === "must-reject")
    .map((scenario) => ({
      scenarioId: scenario.scenarioId,
      passed: scenario.runs.every((run) => !run.passed),
    }));
  const destructiveMutationEvidence = runs.every((run) =>
    run.scenarios
      .filter(({ classification }) => classification === "must-reject")
      .every((scenario) =>
        scenario.mutation.pixelOperation
          ? scenario.mutationEvidence.changedPixelCount > 0
          : true,
      ),
  );
  const candidateAfter = await verifyCandidateFreeze({
    projectRoot: PROJECT_ROOT,
    manifest: candidateSnapshot,
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
      id: "candidate-free-calibration-sources",
      passed: candidateFreeCalibration,
    },
    {
      id: "calibration-source-hashes-recorded",
      passed: calibrationSources.every(
        ({ byteLength, sha256: digest }) =>
          byteLength > 0 && /^[a-f0-9]{64}$/.test(digest),
      ),
    },
    {
      id: "two-valid-reference-only-runs",
      passed: runValidations.every((validation) => validation.passed),
      detail: runValidations,
    },
    {
      id: "identity-copy-is-exact",
      passed: runs.every((run) => identityPassed(run, contract)),
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
      id: "all-should-pass-controls-pass",
      passed: shouldPassChecks.every((check) => check.passed),
      detail: shouldPassChecks,
    },
    {
      id: "all-must-reject-controls-fail",
      passed: mustRejectChecks.every((check) => check.passed),
      detail: mustRejectChecks,
    },
    {
      id: "destructive-pixel-controls-mutated-reference",
      passed: destructiveMutationEvidence,
    },
  ];
  const report = {
    schemaVersion: "patterned-appearance-v2-calibration-report-v1",
    artifactRole: "development-only-authored-reference-calibration",
    productionUse: "prohibited",
    objectId: "umbrella",
    candidateSnapshot,
    calibrationSources: calibrationSources.map(({ source, ...entry }) => entry),
    contract,
    runs,
    thresholdSelection: selection,
    proposedBaseline: baseline,
    scenarioGateResults: scenarios,
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
      `Patterned Appearance v2 calibration failed: ${report.acceptance.failures.map(({ id }) => id).join(", ")}`,
    );
  }
  await writeFile(BASELINE_OUTPUT, `${JSON.stringify(baseline, null, 2)}\n`);
  process.stdout.write(
    `Patterned Appearance Baseline v2: PASS (${baseline.hard.length} hard, ${baseline.diagnostic.length} diagnostic)\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
