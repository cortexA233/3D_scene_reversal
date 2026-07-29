import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import { verifyCandidateFreeze } from "../tools/evaluation/candidate-freeze.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/reports/candle-semantic-appearance-v2-controls.json",
);
const SCENARIOS = Object.freeze([
  { id: "approved-candle-v2", variant: null, expected: "pass" },
  { id: "flatten-stone-system", variant: "flatten-stone-system", expected: "reject" },
  { id: "delete-wax-role", variant: "delete-wax-role", expected: "reject" },
  { id: "delete-wick-role", variant: "delete-wick-role", expected: "reject" },
  { id: "wrong-role-palette", variant: "wrong-role-palette", expected: "reject" },
]);

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(PROJECT_ROOT, relativePath), "utf8"));
}

async function main() {
  const check = process.argv.slice(2).includes("--check");
  const candidateFreeze = await readJson(
    "gt_designer/single-mesh-evaluation/baselines/candle-v2-approved-candidate-freeze.json",
  );
  const before = await verifyCandidateFreeze({ projectRoot: PROJECT_ROOT, manifest: candidateFreeze });
  if (!before.passed) throw new Error(`Candle positive freeze failed before controls: ${JSON.stringify(before.failures)}`);
  const scenarios = [];
  for (let index = 0; index < SCENARIOS.length; index += 1) {
    const scenario = SCENARIOS[index];
    process.stdout.write(`Candle semantic control: ${scenario.id}\n`);
    const automation = await runLocalSceneAutomation({
      label: `candle-semantic-v2-${scenario.id}`,
      serverFlag: "--evaluation",
      path: "/single-mesh-evaluation/",
      query: `?evaluate=object&unit=candle&category-baseline=stage2-v2${
        scenario.variant ? `&appearance-variant=${encodeURIComponent(scenario.variant)}` : ""
      }`,
      readyState: { state: "evaluated", objectId: "candle" },
      probeExpression: `({
        state: document.body?.dataset?.state ?? null,
        objectId: document.body?.dataset?.objectId ?? null,
        report: window.singleMeshEvaluation?.objectEvaluationReport ?? null
      })`,
      timeoutMs: 60_000,
      port: 8550 + index,
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
  const after = await verifyCandidateFreeze({ projectRoot: PROJECT_ROOT, manifest: candidateFreeze });
  const checks = [
    { id: "approved-positive-passes", passed: scenarios[0].actual === "pass" },
    { id: "all-role-damage-controls-reject", passed: scenarios.slice(1).every(({ actual }) => actual === "reject") },
    { id: "geometry-gate-unchanged", passed: scenarios.every(({ geometryPassed }) => geometryPassed) },
    { id: "candidate-freeze-before-and-after", passed: before.passed && after.passed },
  ];
  const report = {
    schemaVersion: "candle-semantic-appearance-controls-v2",
    artifactRole: "development-only-semantic-appearance-evidence",
    productionUse: "prohibited",
    objectId: "candle",
    baselineVersions: {
      geometry: "candle-category-baseline-v1",
      appearance: "candle-semantic-category-baseline-v2",
    },
    historicalEvidence: { categoryV1Result: "FAIL retained without alteration" },
    scenarios,
    acceptance: {
      passed: checks.every(({ passed }) => passed),
      checks,
      failures: checks.filter(({ passed }) => !passed),
    },
  };
  if (!report.acceptance.passed) throw new Error(`Candle semantic controls failed: ${JSON.stringify(report.acceptance.failures)}`);
  if (check) {
    const frozen = JSON.parse(await readFile(OUTPUT, "utf8"));
    if (frozen.schemaVersion !== report.schemaVersion || frozen.scenarios.length !== report.scenarios.length) {
      throw new Error("frozen Candle semantic controls identity differs");
    }
  } else {
    await mkdir(path.dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  }
  process.stdout.write("Candle semantic appearance controls: PASS (1 positive, 4 rejected)\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
