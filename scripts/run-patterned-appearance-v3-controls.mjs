import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import { verifyCandidateFreeze } from "../tools/evaluation/candidate-freeze.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/reports/patterned-appearance-v3-human-anchor.json",
);
const SCENARIOS = Object.freeze([
  { id: "approved-umbrella-v3", variant: null, expected: "pass" },
  { id: "flat-canopy", variant: "flat-canopy", expected: "reject" },
  { id: "wrong-role-palette", variant: "wrong-role-palette", expected: "reject" },
  { id: "delete-flower-family", variant: "delete-flower-family", expected: "reject" },
  { id: "delete-leaf-family", variant: "delete-leaf-family", expected: "reject" },
  { id: "delete-branch-family", variant: "delete-branch-family", expected: "reject" },
  { id: "half-pattern-coverage", variant: "half-pattern-coverage", expected: "reject" },
]);

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(path.join(PROJECT_ROOT, relativePath), "utf8"),
  );
}

async function main() {
  const check = process.argv.slice(2).includes("--check");
  const baseline = await readJson(
    "gt_designer/single-mesh-evaluation/baselines/patterned-appearance-baseline-v3.json",
  );
  const candidateFreeze = await readJson(
    "gt_designer/single-mesh-evaluation/baselines/umbrella-v3-approved-candidate-freeze.json",
  );
  const before = await verifyCandidateFreeze({
    projectRoot: PROJECT_ROOT,
    manifest: candidateFreeze,
  });
  if (!before.passed) {
    throw new Error(`approved candidate freeze failed before controls: ${JSON.stringify(before.failures)}`);
  }
  const scenarios = [];
  for (let index = 0; index < SCENARIOS.length; index += 1) {
    const scenario = SCENARIOS[index];
    process.stdout.write(`patterned v3: ${scenario.id}\n`);
    const automation = await runLocalSceneAutomation({
      label: `patterned-v3-${scenario.id}`,
      serverFlag: "--evaluation",
      path: "/single-mesh-evaluation/",
      query: `?evaluate=object&unit=umbrella&appearance-baseline=patterned-v3${
        scenario.variant
          ? `&appearance-variant=${encodeURIComponent(scenario.variant)}`
          : ""
      }`,
      readyState: { state: "evaluated", objectId: "umbrella" },
      probeExpression: `({
        state: document.body?.dataset?.state ?? null,
        objectId: document.body?.dataset?.objectId ?? null,
        report: window.singleMeshEvaluation?.objectEvaluationReport ?? null
      })`,
      timeoutMs: 60_000,
      port: 8480 + index,
    });
    const report = automation.state.report;
    const actual = report.comparison.gate.passed ? "pass" : "reject";
    scenarios.push({
      id: scenario.id,
      variant: scenario.variant,
      expected: scenario.expected,
      actual,
      passed: actual === scenario.expected,
      geometryPassed: report.comparison.gate.geometryGate.passed,
      semanticPattern: report.comparison.aggregate.semanticPattern,
      diagnosticExactPosition: report.comparison.aggregate.appearance,
      gateFailures: report.comparison.gate.failures,
      replacementChecksums: report.captures.replacementChecksums,
      environment: report.environment,
    });
  }
  const after = await verifyCandidateFreeze({
    projectRoot: PROJECT_ROOT,
    manifest: candidateFreeze,
  });
  const checks = [
    {
      id: "approved-positive-exemplar-passes",
      passed: scenarios[0].actual === "pass",
    },
    {
      id: "all-semantic-damage-controls-reject",
      passed: scenarios.slice(1).every(({ actual }) => actual === "reject"),
    },
    {
      id: "geometry-gate-unchanged",
      passed: scenarios.every(({ geometryPassed }) => geometryPassed),
    },
    {
      id: "candidate-freeze-before-and-after",
      passed: before.passed && after.passed,
    },
  ];
  const report = {
    schemaVersion: "patterned-appearance-v3-human-anchor-evidence-v1",
    artifactRole: "development-only-human-anchored-appearance-evidence",
    productionUse: "prohibited",
    objectId: "umbrella",
    baselineVersion: baseline.version,
    historicalEvidence: {
      v2Result: "FAIL retained without alteration",
      referenceOnlyDestructiveBracket:
        "gt_designer/single-mesh-evaluation/reports/patterned-appearance-v2-calibration.json",
    },
    scenarios,
    acceptance: {
      passed: checks.every(({ passed }) => passed),
      checks,
      failures: checks.filter(({ passed }) => !passed),
    },
  };
  if (!report.acceptance.passed) {
    throw new Error(`patterned v3 controls failed: ${JSON.stringify(report.acceptance.failures)}`);
  }
  if (check) {
    const frozen = JSON.parse(await readFile(OUTPUT, "utf8"));
    if (
      frozen.schemaVersion !== report.schemaVersion ||
      frozen.baselineVersion !== report.baselineVersion ||
      frozen.scenarios.length !== report.scenarios.length
    ) {
      throw new Error("frozen patterned v3 report identity differs");
    }
  } else {
    await mkdir(path.dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  }
  process.stdout.write("patterned appearance v3 controls: PASS (1 approved, 6 rejected)\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
