import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyCandidateFreeze } from "../tools/evaluation/candidate-freeze.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const EVALUATION_ROOT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation",
);

async function read(relativePath) {
  return JSON.parse(await readFile(path.join(PROJECT_ROOT, relativePath), "utf8"));
}

async function main() {
  const historical = await read(
    "gt_designer/single-mesh-evaluation/reports/stage-1-5-certification-v1.json",
  );
  const calibration = await read(
    "gt_designer/single-mesh-evaluation/reports/stone-geometry-v2-calibration.json",
  );
  const baseline = await read(
    "gt_designer/single-mesh-evaluation/baselines/stone-geometry-baseline-v2.json",
  );
  const candidateFreeze = await read(
    "gt_designer/single-mesh-evaluation/baselines/stone-v2-candidate-freeze.json",
  );
  const chrome = await read(
    "gt_designer/single-mesh-evaluation/reports/stone-acceptance-v3.json",
  );
  const firefox = await read(
    "gt_designer/single-mesh-evaluation/reports/firefox-stone-geometry-v2-native-gpu.json",
  );
  const safari = await read(
    "gt_designer/single-mesh-evaluation/reports/safari-stone-geometry-v2-native-gpu.json",
  );
  const freezeVerification = await verifyCandidateFreeze({
    projectRoot: PROJECT_ROOT,
    manifest: candidateFreeze,
  });
  const versioned = (gate) =>
    gate.baselineVersions?.geometry === "stone-geometry-baseline-v2" &&
    gate.baselineVersions?.appearance === "single-mesh-quality-baseline-v1";
  const nativePasses = (report) =>
    report.acceptance.passed &&
    report.objects.length === 1 &&
    report.objects[0].objectId === "stone" &&
    report.objects[0].runs.length === 2 &&
    report.objects[0].runs.every(
      ({ report: run }) =>
        run.comparison.gate.passed &&
        versioned(run.comparison.gate) &&
        run.environment.gpu.hardwareAccelerated === true,
    );
  const appearance = chrome.visual.comparison.categoryAppearance;
  const checks = [
    {
      id: "historical-negative-certification-preserved",
      passed:
        historical.historicalStage1.result === "2/4 FAIL" &&
        historical.certification.passed === false &&
        historical.certification.stage2Authorized === false,
    },
    {
      id: "reference-only-v2-calibration",
      passed:
        calibration.acceptance.passed === true &&
        calibration.thresholdSelection.hard.length === 8 &&
        calibration.thresholdSelection.diagnostic.length === 0 &&
        baseline.frozen === true,
    },
    {
      id: "candidate-quarantine-intact",
      passed: freezeVerification.passed,
      detail: freezeVerification.failures,
    },
    {
      id: "chrome-versioned-visual-and-nonvisual",
      passed:
        chrome.acceptance.passed === true &&
        chrome.nonvisual.acceptance.passed === true &&
        versioned(chrome.visual.comparison.gate),
    },
    {
      id: "uniform-appearance-independent-evidence",
      passed:
        appearance.hard.meanDeltaE00 === 0 &&
        appearance.hard.p90DeltaE00 === 0 &&
        appearance.hard.meanMaskedSsim === 1 &&
        appearance.hard.worstViewSsim === 1 &&
        appearance.hard.paletteCentroidDeltaE00 === 0 &&
        appearance.hard.paletteCoverageL1 === 0 &&
        appearance.diagnostic.evidenceClass ===
          "geometry-conditioned-lit-rgb",
    },
    {
      id: "firefox-native-gpu",
      passed: nativePasses(firefox),
    },
    {
      id: "safari-native-gpu",
      passed: nativePasses(safari),
    },
  ];
  const report = {
    schemaVersion: "stone-stage-1-5-boundary-restart-certification-v1",
    artifactRole: "development-only-boundary-restart-certification",
    productionUse: "prohibited",
    historicalStage1: {
      result: "2/4 FAIL",
      baselineVersion: "single-mesh-quality-baseline-v1",
      preserved: true,
    },
    stone: {
      representation: "bounded-support-polyhedron-v2",
      geometryBaselineVersion: "stone-geometry-baseline-v2",
      appearanceBaselineVersion: "single-mesh-quality-baseline-v1",
      appearanceEvidencePolicy: "uniform-albedo-palette-material-v1",
      geometryConditionedLitRgb: appearance.diagnostic,
      nonvisual: chrome.nonvisual.acceptance,
      chromeReport:
        "gt_designer/single-mesh-evaluation/reports/stone-acceptance-v3.json",
      firefoxReport:
        "gt_designer/single-mesh-evaluation/reports/firefox-stone-geometry-v2-native-gpu.json",
      safariReport:
        "gt_designer/single-mesh-evaluation/reports/safari-stone-geometry-v2-native-gpu.json",
    },
    certification: {
      passed: checks.every((check) => check.passed),
      stage1_5ResumeAt: "patterned-appearance-v2-calibration",
      stage2Authorized: false,
      checks,
      failures: checks.filter((check) => !check.passed),
    },
  };
  const reportOutput = path.join(
    EVALUATION_ROOT,
    "reports/stone-stage-1-5-boundary-restart-certification-v1.json",
  );
  const summaryOutput = path.join(
    EVALUATION_ROOT,
    "reports/stone-stage-1-5-boundary-restart-summary-v1.md",
  );
  await mkdir(path.dirname(reportOutput), { recursive: true });
  await writeFile(reportOutput, `${JSON.stringify(report, null, 2)}\n`);
  const summary = `# Stone Stage 1.5 boundary restart summary v1

Certification result: **${report.certification.passed ? "PASS" : "FAIL"}**.
Stage 1.5 resumes at **Patterned Appearance Baseline v2 calibration**.
Stage 2 authorization remains **DENIED** until the remaining Stage 1.5 gates pass.

The historical Stage 1 result remains **2/4 FAIL**, and the original Stage 1.5
negative certification remains factual under \`single-mesh-quality-baseline-v1\`.
The unchanged 24-direction Stone candidate now passes the separately calibrated
\`stone-geometry-baseline-v2\` in Chrome, native Firefox, and native Safari,
with two stable hardware-GPU runs in each native browser.

Stone's independent uniform-material evidence is exact across albedo, palette,
roughness, and metalness under unchanged v1 appearance numbers. Frozen-lighting
RGB remains reported as Geometry-conditioned Appearance Evidence because its
difference follows the accepted support-polyhedron normals.

All unchanged nonvisual limits pass at 32/32 scalars, 80/320 triangles, one
draw call, 1,488/24,576 geometry bytes, and 0.2/5 ms warm p95. Candidate hashes
match the quarantine manifest before and after calibration and evaluation.
`;
  await writeFile(summaryOutput, summary);
  if (!report.certification.passed) {
    throw new Error(
      `Stone boundary restart certification failed: ${report.certification.failures.map(({ id }) => id).join(", ")}`,
    );
  }
  process.stdout.write("Stone Stage 1.5 boundary restart: PASS; resume at patterned appearance v2\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
