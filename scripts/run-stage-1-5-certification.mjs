import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REPORT_ROOT = "gt_designer/single-mesh-evaluation/reports";
const RUNTIME_REPORT_ROOT =
  "gt_designer/single-mesh-runtime-audit/reports";
const DEFAULT_OUTPUT = path.join(
  PROJECT_ROOT,
  REPORT_ROOT,
  "stage-1-5-certification-v1.json",
);
const DEFAULT_SUMMARY = path.join(
  PROJECT_ROOT,
  REPORT_ROOT,
  "stage-1-5-evidence-summary-v1.md",
);

function parseArguments(args) {
  const options = { output: DEFAULT_OUTPUT, summary: DEFAULT_SUMMARY };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--output" && args[index + 1]) {
      options.output = path.resolve(PROJECT_ROOT, args[++index]);
    } else if (args[index] === "--summary" && args[index + 1]) {
      options.summary = path.resolve(PROJECT_ROOT, args[++index]);
    } else {
      throw new Error(`Unknown or incomplete argument: ${args[index]}`);
    }
  }
  return options;
}

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(path.join(PROJECT_ROOT, relativePath), "utf8"),
  );
}

function summary(report) {
  const stoneFailures = report.gates.stone.visualFailures
    .map(
      (failure) =>
        `- \`${failure.metric}\`: ${failure.actual} ${failure.operator} ${failure.threshold} — FAIL`,
    )
    .join("\n");
  return `# Stage 1.5 evidence summary v1

Certification result: **FAIL**. Stage 2 authorization: **DENIED**.

The historical Stage 1 result remains **2/4 FAIL**. The corrected complete-source
scalar audit and both native-browser qualifier gates pass. Stone's sole second
compact candidate—one 24-direction Bounded Support-plane Polyhedron—passes all
nonvisual budgets and Reference Independence but fails the unchanged
\`single-mesh-quality-baseline-v1\` geometry gate.

## Stone frozen failures

${stoneFailures}

Stone uses 31/32 complete-source scalars, 80/320 triangles, one draw call,
1,488/24,576 geometry bytes, a 1,363/4,096-byte gzip delta, and 0.2/5 ms warm
p95. Passing compactness cannot compensate for visual failure.

## Kill-gate outcome

Patterned Appearance v2 calibration, Umbrella v2 fitting, Bamboo Shoot and
Mushroom pre-calibration, Stage 2 fitting, and the six-object exit were not run.
This is the required stop after two failed reasonable Stone representations;
no threshold was changed from candidate evidence and no historical report was
rewritten. A new boundary decision is required before another implementation
cycle.
`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const historical = await readJson(
    `${REPORT_ROOT}/stage-1-certification-v1.json`,
  );
  const scalarReports = {};
  for (const objectId of ["stone-path", "stone", "vase", "umbrella"]) {
    scalarReports[objectId] = await readJson(
      `${RUNTIME_REPORT_ROOT}/${objectId}-nonvisual-v2.json`,
    );
  }
  const firefox = await readJson(
    `${REPORT_ROOT}/firefox-native-gpu-gates-v1.json`,
  );
  const safari = await readJson(
    `${REPORT_ROOT}/safari-native-gpu-gates-v1.json`,
  );
  const stone = await readJson(`${REPORT_ROOT}/stone-acceptance-v2.json`);
  const historicalPreserved =
    historical.certification.passed === false &&
    historical.certification.passedObjectCount === 2 &&
    historical.certification.requiredObjectCount === 4;
  const scalarPassed = Object.values(scalarReports).every(
    (report) => report.sourceScalars.passed && report.acceptance.passed,
  );
  const browsersQualified = [firefox, safari].every(
    (report) => report.qualification.passed && report.acceptance.passed,
  );
  const stonePassed = stone.acceptance.passed;
  const checks = [
    {
      id: "historical-stage-1-preserved",
      passed: historicalPreserved,
      detail: "single-mesh-quality-baseline-v1 remains 2/4 FAIL",
    },
    {
      id: "complete-source-scalars",
      passed: scalarPassed,
      detail: Object.fromEntries(
        Object.entries(scalarReports).map(([objectId, report]) => [
          objectId,
          {
            value: report.sourceScalars.count,
            maximum: report.sourceScalars.maximum,
          },
        ]),
      ),
    },
    {
      id: "native-browser-qualification",
      passed: browsersQualified,
      detail: {
        firefox: firefox.qualification,
        safari: safari.qualification,
      },
    },
    {
      id: "stone-second-representation-v1",
      passed: stonePassed,
      detail: stone.visual.comparison.gate.failures,
    },
  ];
  const report = {
    schemaVersion: "single-mesh-stage-1-5-certification-v1",
    artifactRole: "development-only-stage-certification",
    productionUse: "prohibited",
    historicalStage1: {
      result: "2/4 FAIL",
      baselineVersion: "single-mesh-quality-baseline-v1",
      report: `${REPORT_ROOT}/stage-1-certification-v1.json`,
      preserved: historicalPreserved,
    },
    gates: {
      completeSourceScalars: checks[1].detail,
      nativeBrowserQualification: checks[2].detail,
      stone: {
        representation: "bounded-support-polyhedron-v2",
        baselineVersion: stone.visual.comparison.gate.baselineVersion,
        visualPassed: stone.visual.comparison.gate.passed,
        visualFailures: stone.visual.comparison.gate.failures,
        nonvisualPassed: stone.nonvisual.acceptance.passed,
        scalars: stone.nonvisual.sourceScalars.count,
        budgets: stone.nonvisual.budgets.actual,
        report: `${REPORT_ROOT}/stone-acceptance-v2.json`,
      },
      laterSteps: {
        status: "not-run-after-stone-kill-gate",
        tickets: ["04", "05", "06", "07", "08", "09", "10"],
      },
    },
    certification: {
      passed: checks.every((check) => check.passed),
      stage2Authorized: false,
      outcome: "FAIL — Stone second compact representation missed frozen v1",
      stopReason: "stone-second-representation-v1",
      checks,
      failures: checks.filter((check) => !check.passed),
    },
  };
  await Promise.all([
    mkdir(path.dirname(options.output), { recursive: true }),
    mkdir(path.dirname(options.summary), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`),
    writeFile(options.summary, summary(report)),
  ]);
  process.stdout.write(
    `Stage 1.5 certification: ${report.certification.passed ? "PASS" : "FAIL"}\n`,
  );
  if (!report.certification.passed) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
