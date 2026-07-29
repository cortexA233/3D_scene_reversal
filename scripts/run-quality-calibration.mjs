import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import { validateQualityCalibration } from "../tools/evaluation/calibration-contract.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DEFAULT_OUTPUT = path.join(
  PROJECT_ROOT,
  "gt_designer/single-mesh-evaluation/baselines/stage-1-quality-calibration-v1.json",
);

function parseArguments(args) {
  const options = { output: DEFAULT_OUTPUT, check: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--check") {
      options.check = true;
    } else if (args[index] === "--output" && args[index + 1]) {
      options.output = path.resolve(PROJECT_ROOT, args[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${args[index]}`);
    }
  }
  return options;
}

const options = parseArguments(process.argv.slice(2));
const result = await runLocalSceneAutomation({
  label: "quality-calibration",
  serverFlag: "--evaluation",
  path: "/single-mesh-evaluation/",
  query: "?calibrate=all",
  readyState: { state: "calibrated", calibrationObjectCount: "4" },
  probeExpression: `(() => ({
    state: document.body?.dataset?.state ?? null,
    statusText: document.querySelector('#state')?.textContent ?? null,
    calibrationObjectCount:
      document.body?.dataset?.calibrationObjectCount ?? null,
    calibrationReport:
      window.singleMeshEvaluation?.calibrationReport ?? null
  }))()`,
  timeoutMs: 300_000,
  port: 8410,
});

const report = result.state.calibrationReport;
if (!report) throw new Error("browser completed without a calibration report");
report.acceptance = validateQualityCalibration(report);
const serialized = `${JSON.stringify(report, null, 2)}\n`;

if (options.check) {
  const frozen = JSON.parse(await readFile(options.output, "utf8"));
  if (
    JSON.stringify(frozen.qualityBaseline) !==
      JSON.stringify(report.qualityBaseline) ||
    frozen.schemaVersion !== report.schemaVersion
  ) {
    throw new Error(
      "frozen calibration protocol or Quality Baseline differs from the live run",
    );
  }
} else {
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, serialized);
}

if (!report.acceptance.passed) {
  for (const failure of report.acceptance.failures) {
    process.stderr.write(
      `calibration failure: ${failure.id}: ${JSON.stringify(failure.detail)}\n`,
    );
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `quality calibration: PASS (${report.acceptance.checkCount} checks, ${result.requestCount} local requests)\n`,
  );
  if (!options.check) {
    process.stdout.write(
      `quality calibration: wrote ${path.relative(PROJECT_ROOT, options.output)}\n`,
    );
  }
}
